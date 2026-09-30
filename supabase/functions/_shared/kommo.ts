import { isChatEventOfLead } from './kommoMessage.ts';

function getSubdomain(): string {
  const subdomain = Deno.env.get('KOMMO_SUBDOMAIN');
  if (!subdomain) throw new Error('KOMMO_SUBDOMAIN not set');
  return subdomain;
}

function getToken(): string {
  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!token) throw new Error('KOMMO_API_TOKEN not set');
  return token;
}

// Limitador por isolate: a API do Kommo aceita ~7 req/s por conta — fica abaixo disso.
const MIN_INTERVAL_MS = 180;
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_INTERVAL_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function call(path: string): Promise<Record<string, unknown>> {
  const url = `https://${getSubdomain()}.kommo.com/api/v4/${path}`;
  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 204) return {};
    // 429 (limite de taxa) e 5xx: tenta de novo com backoff exponencial.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) {
      throw new Error(`Kommo API ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }
}

export interface KommoUser {
  id: number;
  name: string;
  email: string | null;
}

/** Endpoint estável e documentado da API v4 do Kommo — usado para popular o mapeamento manual vendedor ↔ usuário. */
export async function fetchAllUsers(): Promise<KommoUser[]> {
  const users: KommoUser[] = [];
  let page = 1;
  const limit = 250;
  while (true) {
    const res = await call(`users?page=${page}&limit=${limit}`);
    const embedded = res?._embedded as Record<string, unknown> | undefined;
    const pageUsers = (embedded?.users ?? []) as Array<{ id: number; name: string; email?: string | null }>;
    users.push(...pageUsers.map((u) => ({ id: u.id, name: u.name, email: u.email ?? null })));
    const links = res?._links as Record<string, unknown> | undefined;
    if (!links?.next || pageUsers.length === 0) break;
    page += 1;
  }
  return users;
}

export interface KommoLead {
  id: number;
  name: string;
  responsible_user_id: number;
}

/** Usado pelo webhook para descobrir o vendedor responsável (entity_id da mensagem = id do lead). */
export async function fetchLead(id: string | number): Promise<KommoLead> {
  const res = await call(`leads/${id}`);
  return res as unknown as KommoLead;
}

/**
 * Eventos de mensagem de chat de um lead (incoming_chat_message / outgoing_chat_message).
 * O Kommo indexa esses eventos pelo CONTATO (filtrar por lead não retorna nada); cada evento
 * traz entity_type/entity_id do lead ao qual o talk estava vinculado. Só entram eventos
 * explicitamente deste lead — eventos de talks sem lead ou de outros leads do mesmo contato ficam fora.
 * A API v4 pública não expõe o texto — só id, direção, horário e autor (created_by).
 */
export async function fetchLeadChatMessageEvents(
  leadId: string | number,
  contactIds: Array<string | number>,
  sinceUnix?: number
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const events: any[] = [];
  for (const contactId of contactIds) {
    let page = 1;
    while (true) {
      const query = [
        `page=${page}`,
        'limit=100',
        'filter[entity]=contact',
        `filter[entity_id][]=${encodeURIComponent(String(contactId))}`,
        'filter[type][]=incoming_chat_message',
        'filter[type][]=outgoing_chat_message',
        ...(sinceUnix ? [`filter[created_at][from]=${Math.floor(sinceUnix)}`] : []),
      ].join('&');
      const res = await call(`events?${query}`);
      const embedded = res?._embedded as Record<string, unknown> | undefined;
      // deno-lint-ignore no-explicit-any
      const pageEvents = (embedded?.events ?? []) as any[];
      events.push(...pageEvents.filter((e) => isChatEventOfLead(e, leadId)));
      const links = res?._links as Record<string, unknown> | undefined;
      if (!links?.next || pageEvents.length === 0) break;
      page += 1;
    }
  }
  return events;
}

/**
 * Eventos de chat da conta inteira desde `sinceUnix` (sem filtro de entidade), do mais novo para o
 * mais antigo. Usado pelo cron: descobre de uma vez quais leads tiveram mensagens recentes.
 */
// deno-lint-ignore no-explicit-any
export async function fetchRecentChatEvents(sinceUnix: number, maxPages = 50): Promise<{ events: any[]; truncated: boolean }> {
  // deno-lint-ignore no-explicit-any
  const events: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const query = [
      `page=${page}`,
      'limit=100',
      'filter[type][]=incoming_chat_message',
      'filter[type][]=outgoing_chat_message',
      `filter[created_at][from]=${Math.floor(sinceUnix)}`,
    ].join('&');
    const res = await call(`events?${query}`);
    const embedded = res?._embedded as Record<string, unknown> | undefined;
    // deno-lint-ignore no-explicit-any
    const pageEvents = (embedded?.events ?? []) as any[];
    events.push(...pageEvents);
    const links = res?._links as Record<string, unknown> | undefined;
    if (!links?.next || pageEvents.length === 0) return { events, truncated: false };
  }
  return { events, truncated: true };
}

export interface KommoTalk {
  chat_id: string | null;
  entity_id: string | null;
  entity_type: string | null;
}

/** Talk → chat: usado para achar a conversa de mensagens cujo talk ainda não tem mensagem gravada. */
export async function fetchTalk(talkId: string | number): Promise<KommoTalk | null> {
  try {
    const res = await call(`talks/${encodeURIComponent(String(talkId))}`);
    return {
      chat_id: res?.chat_id ? String(res.chat_id) : null,
      entity_id: res?.entity_id ? String(res.entity_id) : null,
      entity_type: res?.entity_type ? String(res.entity_type) : null,
    };
  } catch (err) {
    console.error(`failed to fetch kommo talk ${talkId}`, err);
    return null;
  }
}

/** Diagnóstico: primeira página de eventos de um lead sem filtro de tipo (só metadados). */
// deno-lint-ignore no-explicit-any
export function fetchEntityEventsRaw(entity: 'lead' | 'contact', id: string | number): Promise<any> {
  return call(`events?limit=100&filter[entity]=${entity}&filter[entity_id][]=${encodeURIComponent(String(id))}`);
}

/** Diagnóstico: notas de uma entidade (primeira página). */
// deno-lint-ignore no-explicit-any
export function fetchEntityNotesRaw(entity: 'leads' | 'contacts', id: string | number): Promise<any> {
  return call(`${entity}/${encodeURIComponent(String(id))}/notes?limit=250`);
}
