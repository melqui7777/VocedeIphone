import { supabase } from './supabaseClient';
import type {
  Seller,
  Product,
  Sale,
  Conversation,
  ConversationMessage,
  Goals,
  PanelSettings,
  KommoUser,
} from './database.types';

const PAGE_SIZE = 1000;

/** O Supabase corta qualquer select em 1000 linhas por padrão — pagina até esgotar. */
async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function fetchSellers(): Promise<Seller[]> {
  return fetchAllRows<Seller>((from, to) =>
    supabase.from('sellers').select('*').order('name').range(from, to)
  );
}

export async function fetchSellerById(id: string): Promise<Seller> {
  const { data, error } = await supabase.from('sellers').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

/** Vendedores com o toggle "aparecer no ranking" ligado — usado em Vendedores, Dashboard, Painel TV e Previsão. */
export async function fetchVisibleSellers(): Promise<Seller[]> {
  return fetchAllRows<Seller>((from, to) =>
    supabase.from('sellers').select('*').eq('show_in_ranking', true).order('name').range(from, to)
  );
}

export async function updateSellerRankingVisibility(id: string, show_in_ranking: boolean): Promise<void> {
  const { error } = await supabase.from('sellers').update({ show_in_ranking }).eq('id', id);
  if (error) throw error;
}

/** Usuários do Kommo sincronizados via kommo-sync — usados para o mapeamento manual vendedor ↔ usuário Kommo. */
export async function fetchKommoUsers(): Promise<KommoUser[]> {
  return fetchAllRows<KommoUser>((from, to) =>
    supabase.from('kommo_users').select('*').order('name').range(from, to)
  );
}

export async function updateSellerKommoMapping(id: string, kommo_user_id: string | null): Promise<void> {
  const { error } = await supabase.from('sellers').update({ kommo_user_id }).eq('id', id);
  if (error) throw error;
}

export async function fetchProducts(): Promise<Product[]> {
  return fetchAllRows<Product>((from, to) =>
    supabase.from('products').select('*').order('name').range(from, to)
  );
}

export async function insertProduct(input: {
  name: string;
  category: 'Aparelhos' | 'Acessórios';
  brand: string | null;
  location: string | null;
  stock: number;
  min_stock: number;
  price: number;
  imei: string | null;
  battery_health: string | null;
}): Promise<Product> {
  const code = `EST-${Date.now().toString(36).toUpperCase()}`;
  const { data, error } = await supabase
    .from('products')
    .insert({ ...input, code })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProductStock(id: string, stock: number): Promise<void> {
  const { error } = await supabase.from('products').update({ stock }).eq('id', id);
  if (error) throw error;
}

export async function fetchSalesInRange(start: Date, end: Date): Promise<Sale[]> {
  return fetchAllRows<Sale>((from, to) =>
    supabase
      .from('sales')
      .select('*')
      .gte('sold_at', start.toISOString())
      .lt('sold_at', end.toISOString())
      .order('sold_at')
      .range(from, to)
  );
}

/** Todas as vendas já registradas na plataforma, mais recentes primeiro. */
export async function fetchAllSales(): Promise<Sale[]> {
  return fetchAllRows<Sale>((from, to) =>
    supabase.from('sales').select('*').order('sold_at', { ascending: false }).range(from, to)
  );
}

export async function fetchAllConversations(): Promise<Conversation[]> {
  return fetchAllRows<Conversation>((from, to) =>
    supabase.from('conversations').select('*').order('id').range(from, to)
  );
}

export async function fetchConversationsBySeller(sellerId: string): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('seller_id', sellerId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Timeline da conversa em ordem cronológica estável (ver compareTimeline em transcript.ts). */
export type TimelineMessage = Pick<
  ConversationMessage,
  'id' | 'external_id' | 'sender' | 'sender_name' | 'message' | 'message_type' | 'sent_at' | 'received_seq'
>;

export async function fetchConversationMessages(conversationId: string): Promise<TimelineMessage[]> {
  return fetchAllRows<TimelineMessage>((from, to) =>
    supabase
      .from('conversation_messages')
      .select('id, external_id, sender, sender_name, message, message_type, sent_at, received_seq')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .order('received_seq', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );
}

export async function fetchGoals(): Promise<Goals> {
  const { data, error } = await supabase.from('goals').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updateGoals(patch: Partial<Omit<Goals, 'id' | 'updated_at'>>): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

export async function fetchPanelSettings(): Promise<PanelSettings> {
  const { data, error } = await supabase.from('panel_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data;
}

export async function updatePanelSettings(
  patch: Partial<Omit<PanelSettings, 'id' | 'updated_at'>>
): Promise<void> {
  const { error } = await supabase
    .from('panel_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

export interface SellerPerformance {
  seller: Seller;
  sold: number;
  devicesSold: number;
  accessoriesSold: number;
  conversion: number;
}

/** Sold units come from `sales`; conversion comes from `conversations` (0 when the seller has none yet). */
export function computeSellerPerformance(
  sellers: Seller[],
  sales: Sale[],
  conversations: Conversation[],
  products?: Product[]
): SellerPerformance[] {
  const soldBySeller = new Map<string, number>();
  const devicesSoldBySeller = new Map<string, number>();
  const accessoriesSoldBySeller = new Map<string, number>();
  const productMap = products ? new Map(products.map((p) => [p.id, p])) : null;

  for (const sale of sales) {
    const qty = sale.quantity;
    soldBySeller.set(sale.seller_id, (soldBySeller.get(sale.seller_id) ?? 0) + qty);

    if (productMap) {
      const prod = productMap.get(sale.product_id);
      if (prod) {
        if (prod.category === 'Aparelhos') {
          devicesSoldBySeller.set(sale.seller_id, (devicesSoldBySeller.get(sale.seller_id) ?? 0) + qty);
        } else if (prod.category === 'Acessórios') {
          accessoriesSoldBySeller.set(sale.seller_id, (accessoriesSoldBySeller.get(sale.seller_id) ?? 0) + qty);
        }
      }
    }
  }

  const conversationStatsBySeller = new Map<string, { success: number; total: number }>();
  for (const conv of conversations) {
    if (!conv.seller_id) continue;
    const stats = conversationStatsBySeller.get(conv.seller_id) ?? { success: 0, total: 0 };
    stats.total += 1;
    if (conv.result_type === 'success') stats.success += 1;
    conversationStatsBySeller.set(conv.seller_id, stats);
  }

  return sellers.map((seller) => {
    const stats = conversationStatsBySeller.get(seller.id);
    return {
      seller,
      sold: soldBySeller.get(seller.id) ?? 0,
      devicesSold: devicesSoldBySeller.get(seller.id) ?? 0,
      accessoriesSold: accessoriesSoldBySeller.get(seller.id) ?? 0,
      conversion: stats && stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0,
    };
  });
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end };
}

/** Week starts on Monday. */
export function getWeekRange(date: Date): { start: Date; end: Date } {
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() + diffToMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  return { start, end };
}

export function getDayRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return { start, end };
}
