import { createClient } from '@supabase/supabase-js';

import { sessionStorage } from './session-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// null when unconfigured so the app renders an honest "not connected" state instead of crashing.
export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        storage: sessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function db() {
  if (!supabase) throw new Error('The Wealthline backend is not configured for this build.');
  return supabase;
}
