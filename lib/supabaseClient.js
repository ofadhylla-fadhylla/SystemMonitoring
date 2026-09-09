import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export function getSupabaseConfigError() {
  if (!supabaseUrl) return 'NEXT_PUBLIC_SUPABASE_URL is missing in Vercel Environment Variables.';
  if (!supabaseKey) return 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing in Vercel Environment Variables.';
  return '';
}
