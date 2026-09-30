import type { ConversationMessage } from './database.types';

export type TranscriptSender = 'client' | 'seller' | 'bot' | 'system';

export interface TranscriptMessage {
  id: string;
  sender: TranscriptSender;
  senderName: string;
  text: string;
  /** Tipo do anexo do Kommo quando não é texto (picture, file, voice...). */
  attachmentType: string | null;
  /** Mensagem conhecida só pela events API do Kommo: autor e horário reais, texto indisponível. */
  unavailable: boolean;
  /** Horário para exibição — derivado de sent_at (UTC) uma única vez, no fuso do navegador. */
  time: string;
  /** Data completa, preenchida só quando o dia muda em relação à mensagem anterior. */
  dayLabel: string | null;
}

type TimelineRow = Pick<ConversationMessage, 'id' | 'sender' | 'message' | 'sent_at'> &
  Partial<Pick<ConversationMessage, 'sender_name' | 'message_type' | 'received_seq'>>;

/**
 * Ordem cronológica estável: horário original do Kommo (sent_at, UTC), depois a ordem de
 * chegada no banco (received_seq) para mensagens do mesmo segundo, e por fim o id.
 */
export function compareTimeline(a: TimelineRow, b: TimelineRow): number {
  const ta = Date.parse(a.sent_at);
  const tb = Date.parse(b.sent_at);
  if (ta !== tb) return ta - tb;
  const sa = a.received_seq ?? Number.MAX_SAFE_INTEGER;
  const sb = b.received_seq ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const SENDERS: readonly TranscriptSender[] = ['client', 'seller', 'bot', 'system'];

/**
 * Monta a transcrição exibida. O nome mostrado é o autor gravado na mensagem; quando o Kommo não
 * informou o autor de uma mensagem da empresa, mostra "Atendente" em vez de presumir que foi o
 * vendedor responsável pelo lead (a mensagem pode ter vindo de outro usuário ou do app do WhatsApp).
 */
export function buildTranscript(
  rows: TimelineRow[],
  names: { clientName: string },
  timeZone?: string
): TranscriptMessage[] {
  const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone });

  let previousDay: string | null = null;
  return [...rows].sort(compareTimeline).map((m) => {
    // O remetente vem do banco já classificado pela integração — nunca é inferido aqui.
    const sender: TranscriptSender = SENDERS.includes(m.sender as TranscriptSender)
      ? (m.sender as TranscriptSender)
      : 'system';
    const fallbackName =
      sender === 'seller' ? 'Atendente' : sender === 'client' ? names.clientName : sender === 'bot' ? 'Bot' : 'Sistema';
    const date = new Date(m.sent_at);
    const day = dayFmt.format(date);
    const dayLabel = day !== previousDay ? day : null;
    previousDay = day;
    const messageType = m.message_type ?? 'text';
    return {
      id: m.id,
      sender,
      senderName: m.sender_name?.trim() || fallbackName,
      text: m.message,
      attachmentType: messageType !== 'text' && messageType !== 'unavailable' ? messageType : null,
      unavailable: messageType === 'unavailable',
      time: timeFmt.format(date),
      dayLabel,
    };
  });
}
