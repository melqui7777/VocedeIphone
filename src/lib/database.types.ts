export type Seller = {
  id: string;
  name: string;
  photo_url: string | null;
  active: boolean;
  show_in_ranking: boolean;
  kommo_user_id: string | null;
  created_at: string;
};

export type KommoUser = {
  id: string;
  name: string;
  email: string | null;
  synced_at: string;
};

export type Product = {
  id: string;
  name: string;
  code: string;
  brand: string | null;
  category: 'Aparelhos' | 'Acessórios';
  location: string | null;
  stock: number;
  min_stock: number;
  price: number;
  imei: string | null;
  battery_health: string | null;
  created_at: string;
};

export type Sale = {
  id: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  amount: number;
  sold_at: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  external_id: string | null;
  seller_id: string | null;
  client_name: string;
  occurred_at: string;
  product: string | null;
  result: string | null;
  result_type: 'success' | 'loss' | null;
  summary: string | null;
  key_points: string[];
  duration_seconds: number | null;
  messages_count: number | null;
  sentiment: string | null;
  score: number | null;
  objections: string | null;
  strengths: string[];
  improvements: string[];
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

export type ConversationMessage = {
  id: string;
  conversation_id: string;
  external_id: string | null;
  sender: 'client' | 'seller';
  message: string;
  sent_at: string;
  created_at: string;
};

export type Goals = {
  id: 1;
  weekly_devices_target: number;
  weekly_accessories_target: number;
  monthly_devices_target: number;
  monthly_accessories_target: number;
  updated_at: string;
};

export type PanelSettings = {
  id: 1;
  show_ranking: boolean;
  show_goals: boolean;
  show_products: boolean;
  show_tv_panel: boolean;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      sellers: { Row: Seller; Insert: Partial<Seller>; Update: Partial<Seller>; Relationships: [] };
      kommo_users: { Row: KommoUser; Insert: Partial<KommoUser>; Update: Partial<KommoUser>; Relationships: [] };
      products: { Row: Product; Insert: Partial<Product>; Update: Partial<Product>; Relationships: [] };
      sales: { Row: Sale; Insert: Partial<Sale>; Update: Partial<Sale>; Relationships: [] };
      conversations: { Row: Conversation; Insert: Partial<Conversation>; Update: Partial<Conversation>; Relationships: [] };
      conversation_messages: { Row: ConversationMessage; Insert: Partial<ConversationMessage>; Update: Partial<ConversationMessage>; Relationships: [] };
      goals: { Row: Goals; Insert: Partial<Goals>; Update: Partial<Goals>; Relationships: [] };
      panel_settings: { Row: PanelSettings; Insert: Partial<PanelSettings>; Update: Partial<PanelSettings>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
