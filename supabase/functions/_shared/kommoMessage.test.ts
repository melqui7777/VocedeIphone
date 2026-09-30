// Rodar com: npm test  (node --test, Node >= 22.6 remove os tipos TS nativamente)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySender,
  compareWithKommoEvents,
  conversationKey,
  extractWebhookMessages,
  normalizeKommoMessage,
  parseBracketForm,
  parseChatMessageEvents,
  parseKommoTimestamp,
  planPlaceholders,
  collectUnknownTalks,
  isChatEventOfLead,
  type KommoWebhookMessage,
} from './kommoMessage.ts';

const RECEIVED = new Date('2026-09-26T15:00:00.000Z');

function msg(over: Partial<KommoWebhookMessage> = {}): KommoWebhookMessage {
  return {
    id: 'm-1',
    chat_id: 'chat-A',
    talk_id: '10',
    contact_id: '500',
    text: 'Olá',
    created_at: '1790000000',
    entity_type: 'lead',
    entity_id: '9001',
    type: 'incoming',
    author: { id: 'ext-1', type: 'external', name: 'Maria Cliente' },
    ...over,
  };
}

test('parseBracketForm + extractWebhookMessages reconstroem message[add] do form-urlencoded', () => {
  const body = new URLSearchParams({
    'message[add][0][id]': 'a',
    'message[add][0][chat_id]': 'c1',
    'message[add][0][author][name]': 'Maria',
    'message[add][1][id]': 'b',
    'message[add][1][chat_id]': 'c1',
    'account[subdomain]': 'loja',
  }).toString();
  const list = extractWebhookMessages(parseBracketForm(body));
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'a');
  assert.equal(list[0].author?.name, 'Maria');
  assert.equal(list[1].id, 'b');
});

test('parseBracketForm não permite poluir o protótipo de Object', () => {
  const parsed = parseBracketForm(
    '__proto__[polluted]=yes&message[add][0][constructor][x]=1&message[add][0][toString][call]=x&message[add][0][id]=a'
  );
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.toString.call([]), '[object Array]');
  assert.deepEqual(extractWebhookMessages(parsed).map((m) => m.id), ['a']);
});

test('parseBracketForm rejeita índices gigantes e "length" em arrays (sem array esparso enorme)', () => {
  const started = Date.now();
  const parsed = parseBracketForm('message[add][length]=1000000000&message[add][999999999][id]=x&message[add][0][id]=a');
  assert.deepEqual(extractWebhookMessages(parsed).map((m) => m.id), ['a']);
  assert.ok(Date.now() - started < 200);
});

test('extractWebhookMessages ignora payloads sem mensagens e buracos no array', () => {
  assert.deepEqual(extractWebhookMessages({ leads: { add: [] } }), []);
  assert.deepEqual(extractWebhookMessages(null), []);
  // índice pulado vira buraco no array esparso
  const sparse = parseBracketForm('message[add][0][id]=a&message[add][2][id]=c');
  assert.deepEqual(extractWebhookMessages(sparse).map((m) => m.id), ['a', 'c']);
});

test('timestamp: unix em segundos é interpretado como UTC, sem fuso local', () => {
  assert.deepEqual(parseKommoTimestamp('1790000000', RECEIVED), { iso: '2026-09-21T14:13:20.000Z', valid: true });
  assert.deepEqual(parseKommoTimestamp(1790000000, RECEIVED), { iso: '2026-09-21T14:13:20.000Z', valid: true });
  // milissegundos
  assert.deepEqual(parseKommoTimestamp('1790000000123', RECEIVED), { iso: '2026-09-21T14:13:20.123Z', valid: true });
  // ISO com offset é convertido para UTC
  assert.equal(parseKommoTimestamp('2026-09-21T11:13:20-03:00', RECEIVED).iso, '2026-09-21T14:13:20.000Z');
});

test('timestamp ausente/inválido/implausível cai no horário de recebimento e é sinalizado', () => {
  // '-5' e '99999999999' (ano 5138) eram aceitos antes; string sem fuso dependeria do fuso do servidor
  for (const raw of [undefined, '', 'abc', '0', null, '-5', '99999999999', '2026-09-26 10:00:00', '1262304000']) {
    assert.deepEqual(parseKommoTimestamp(raw as string, RECEIVED), { iso: RECEIVED.toISOString(), valid: false }, String(raw));
  }
});

test('remetente: direção do Kommo manda; bot e sistema separados do atendente', () => {
  assert.equal(classifySender(msg({ type: 'incoming', author: { type: 'external' } })), 'client');
  // mesmo que author.type venha "user", incoming é cliente
  assert.equal(classifySender(msg({ type: 'incoming', author: { type: 'user' } })), 'client');
  assert.equal(classifySender(msg({ type: 'outgoing', author: { type: 'user', name: 'João' } })), 'seller');
  assert.equal(classifySender(msg({ type: 'outgoing', author: { type: 'bot' } })), 'bot');
  assert.equal(classifySender(msg({ type: 'outgoing', author: { type: 'SalesBot' } })), 'bot');
  assert.equal(classifySender(msg({ type: 'outgoing', author: { type: 'system' } })), 'system');
  assert.equal(classifySender(msg({ type: 'outgoing', author: undefined })), 'seller');
  // sem direção: usa author.type
  assert.equal(classifySender(msg({ type: undefined, author: { type: 'external' } })), 'client');
  assert.equal(classifySender(msg({ type: undefined, author: { type: 'user' } })), 'seller');
  assert.equal(classifySender(msg({ type: undefined, author: { type: 'internal' } })), 'seller');
  assert.equal(classifySender(msg({ type: undefined, author: undefined })), 'system');
});

test('normalize: mensagem do cliente com todos os identificadores e raw preservado', () => {
  const raw = msg();
  const r = normalizeKommoMessage(raw, RECEIVED);
  assert.ok(r.ok);
  const v = r.value;
  assert.equal(v.kommo_message_id, 'm-1');
  assert.equal(v.kommo_chat_id, 'chat-A');
  assert.equal(v.kommo_talk_id, '10');
  assert.equal(v.kommo_contact_id, '500');
  assert.equal(v.kommo_lead_id, '9001');
  assert.equal(v.direction, 'incoming');
  assert.equal(v.sender_type, 'client');
  assert.equal(v.sender_name, 'Maria Cliente');
  assert.equal(v.created_at_original, '1790000000');
  assert.equal(v.sent_at, '2026-09-21T14:13:20.000Z');
  assert.equal(v.timestamp_valid, true);
  assert.equal(v.message_type, 'text');
  assert.equal(v.raw_payload, raw);
});

test('normalize: anexo sem texto não é descartado', () => {
  const r = normalizeKommoMessage(msg({ text: '', attachment: { type: 'picture', link: 'https://x' } }), RECEIVED);
  assert.ok(r.ok);
  assert.equal(r.value.message_type, 'picture');
  assert.equal(r.value.message_text, '');
});

test('normalize: rejeita o que não dá para rastrear/agrupar', () => {
  assert.deepEqual(normalizeKommoMessage(msg({ id: undefined }), RECEIVED), { ok: false, reason: 'missing_message_id' });
  assert.deepEqual(normalizeKommoMessage(msg({ chat_id: '' }), RECEIVED), { ok: false, reason: 'missing_chat_id' });
  assert.deepEqual(normalizeKommoMessage(msg({ text: '   ' }), RECEIVED), { ok: false, reason: 'empty_message' });
});

test('normalize: bot e sistema recebem nome padrão quando o Kommo não envia', () => {
  const bot = normalizeKommoMessage(msg({ type: 'outgoing', author: { type: 'bot' } }), RECEIVED);
  assert.ok(bot.ok);
  assert.equal(bot.value.sender_name, 'Bot');
  const sys = normalizeKommoMessage(msg({ type: 'outgoing', author: { type: 'system' } }), RECEIVED);
  assert.ok(sys.ok);
  assert.equal(sys.value.sender_name, 'Sistema');
});

test('agrupamento: lead + chat; leads diferentes no mesmo chat não se misturam', () => {
  const a = normalizeKommoMessage(msg({ entity_id: '1' }), RECEIVED);
  const b = normalizeKommoMessage(msg({ entity_id: '2' }), RECEIVED);
  const c = normalizeKommoMessage(msg({ entity_id: '1', chat_id: 'chat-B' }), RECEIVED);
  const d = normalizeKommoMessage(msg({ entity_type: 'contact', entity_id: '500' }), RECEIVED);
  assert.ok(a.ok && b.ok && c.ok && d.ok);
  assert.equal(conversationKey(a.value), 'kommo:lead:1:chat:chat-A');
  assert.equal(conversationKey(b.value), 'kommo:lead:2:chat:chat-A');
  assert.equal(conversationKey(c.value), 'kommo:lead:1:chat:chat-B');
  assert.equal(conversationKey(d.value), 'kommo:contact:500:chat:chat-A');
  assert.equal(d.value.kommo_lead_id, null);
});

test('auditoria: detecta faltantes, remetente invertido, horário divergente e ordem', () => {
  const events = parseChatMessageEvents([
    { type: 'incoming_chat_message', created_at: 1790000000, value_after: [{ message: { id: 'a', talk_id: 1 } }] },
    { type: 'outgoing_chat_message', created_at: 1790000010, value_after: [{ message: { id: 'b', talk_id: 1 } }] },
    { type: 'incoming_chat_message', created_at: 1790000020, value_after: [{ message: { id: 'c', talk_id: 1 } }] },
    { type: 'lead_status_changed', created_at: 1790000030, value_after: [] },
  ]);
  assert.equal(events.length, 3);

  const ok = compareWithKommoEvents(events, [
    { external_id: 'a', sender: 'client', sent_at: new Date(1790000000_000).toISOString() },
    { external_id: 'b', sender: 'seller', sent_at: new Date(1790000010_000).toISOString() },
    { external_id: 'c', sender: 'client', sent_at: new Date(1790000020_000).toISOString() },
  ]);
  assert.deepEqual(ok.missing_in_db, []);
  assert.deepEqual(ok.sender_mismatch, []);
  assert.deepEqual(ok.timestamp_mismatch, []);
  assert.equal(ok.order_matches, true);

  const bad = compareWithKommoEvents(events, [
    { external_id: 'b', sender: 'client', sent_at: new Date(1790000010_000).toISOString() },
    { external_id: 'a', sender: 'client', sent_at: new Date(1790000100_000).toISOString() },
  ]);
  assert.deepEqual(bad.missing_in_db.map((m) => m.message_id), ['c']);
  assert.deepEqual(bad.sender_mismatch.map((m) => m.message_id), ['b']);
  assert.deepEqual(bad.timestamp_mismatch.map((m) => m.message_id), ['a']);
  assert.equal(bad.order_matches, false);
});

test('planPlaceholders: marca só o que falta, no talk certo, com autor real, sem chutar conversa', () => {
  const ev = (type: string, id: string, talk: number, created_by: number, created_at = 1790000000) => ({
    type, created_at, created_by, entity_type: 'lead', entity_id: 1, value_after: [{ message: { id, talk_id: talk, origin: 'waba' } }],
  });
  const events = [
    ev('incoming_chat_message', 'in-1', 10, 0),                  // já existe (veio pelo webhook)
    ev('outgoing_chat_message', 'out-1', 10, 11341787, 1790000010), // atendente conhecido
    ev('outgoing_chat_message', 'out-2', 10, 0, 1790000020),        // sem usuário (automação/app externo)
    ev('outgoing_chat_message', 'out-1', 10, 11341787, 1790000010), // repetido na API
    ev('incoming_chat_message', 'in-2', 10, 0, 1790000030),         // recebida que o webhook perdeu
    ev('outgoing_chat_message', 'out-3', 20, 5, 1790000040),        // talk resolvido pelo chat (via /talks)
    ev('outgoing_chat_message', 'out-4', 99, 5, 1790000050),        // talk desconhecido: não chuta
    { type: 'lead_status_changed', created_at: 1790000000, value_after: [] },
  ];
  const existingMessageIds = new Set(['in-1']);
  const talkToConversation = new Map([['10', 'conv-A']]);
  assert.deepEqual(collectUnknownTalks(events, existingMessageIds, talkToConversation), ['20', '99']);

  const plan = planPlaceholders(events, {
    existingMessageIds,
    talkToConversation,
    talkChatConversation: new Map([['20', 'conv-B']]),
    userNames: new Map([['11341787', 'Ana']]),
  });
  assert.deepEqual(
    plan.placeholders.map((p) => [p.kommo_message_id, p.conversation_id, p.sender_type, p.sender_name, p.sent_at]),
    [
      ['out-1', 'conv-A', 'seller', 'Ana', '2026-09-21T14:13:30.000Z'],
      ['out-2', 'conv-A', 'bot', 'Automação ou envio externo', '2026-09-21T14:13:40.000Z'],
      ['in-2', 'conv-A', 'client', null, '2026-09-21T14:13:50.000Z'],
      ['out-3', 'conv-B', 'seller', null, '2026-09-21T14:14:00.000Z'],
    ]
  );
  assert.deepEqual(plan.unmatched, ['out-4']);
});

test('eventos de chat do contato não vazam para outros leads nem para talks sem lead', () => {
  assert.equal(isChatEventOfLead({ entity_type: 'lead', entity_id: 1001 }, '1001'), true);
  assert.equal(isChatEventOfLead({ entity_type: 'lead', entity_id: 3003 }, '1001'), false);
  assert.equal(isChatEventOfLead({ entity_type: 'contact', entity_id: 500 }, '1001'), false);
  assert.equal(isChatEventOfLead({}, '1001'), false);
});

test('planPlaceholders: eventos vêm do mais novo para o mais antigo; marcadores saem em ordem cronológica', () => {
  const ev = (id: string, created_at: number) => ({
    type: 'outgoing_chat_message', created_at, created_by: 7, entity_type: 'lead', entity_id: 1,
    value_after: [{ message: { id, talk_id: 10 } }],
  });
  // resposta da API: decrescente, com rajada de 3 mensagens no mesmo segundo (b3 é a mais nova)
  const plan = planPlaceholders([ev('c', 1790000100), ev('b3', 1790000050), ev('b2', 1790000050), ev('b1', 1790000050), ev('a', 1790000000)], {
    existingMessageIds: new Set(), talkToConversation: new Map([['10', 'conv']]), talkChatConversation: new Map(), userNames: new Map(),
  });
  assert.deepEqual(plan.placeholders.map((p) => p.kommo_message_id), ['a', 'b1', 'b2', 'b3', 'c']);
});
