import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://bduiyeddwlgxzpzbelqf.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-h1kA0MhtiH4_RuZBxKGbg_thh6RRG-';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
