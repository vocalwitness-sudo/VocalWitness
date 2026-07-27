// js/supabase-config.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://opotzbvjlgykgyjjwxwb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_P_UfxwkVBkM6XdzHb8uiFw_EJGGh7hA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
