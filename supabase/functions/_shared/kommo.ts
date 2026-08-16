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

async function call(path: string): Promise<Record<string, unknown>> {
  const url = `https://${getSubdomain()}.kommo.com/api/v4/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 204) return {};
  if (!res.ok) {
    throw new Error(`Kommo API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
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
  // deno-lint-ignore no-constant-condition
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
