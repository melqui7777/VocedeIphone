import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  envUrl &&
  envAnonKey &&
  typeof envUrl === 'string' &&
  typeof envAnonKey === 'string' &&
  envUrl.trim().length > 0 &&
  envAnonKey.trim().length > 0 &&
  envUrl.startsWith('http')
);

// Fallback to placeholder to prevent module crash if .env keys are missing or invalid
const supabaseUrl = isSupabaseConfigured ? envUrl : 'https://placeholder.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? envAnonKey : 'placeholder-anon-key';

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase credentials missing or incomplete in .env. Using fallback client.');
}

export const supabase = createClient<Database, 'public'>(supabaseUrl, supabaseAnonKey);

