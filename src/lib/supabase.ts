import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL!;
const anon = process.env.SUPABASE_ANON_KEY!;
const svc  = process.env.SUPABASE_SERVICE_ROLE!;

export const supabase = createClient(url, anon, { auth: { persistSession: false } });
export const supabaseAdmin = createClient(url, svc, { auth: { persistSession: false } });
