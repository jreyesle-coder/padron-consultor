import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mwddvwulxbxqtcdcyewh.supabase.co';
const supabaseAnonKey = 'sb_publishable_P-_7j53-tV1gkZYJixh-0A_GnhA6zU5';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);