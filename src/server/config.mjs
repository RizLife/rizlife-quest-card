import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';

const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and add your Supabase project credentials.');
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT || 8765),
  publicDirectory: fileURLToPath(new URL('../../public/', import.meta.url)),
  supabaseUrl: process.env.SUPABASE_URL,
  publicKey: process.env.SUPABASE_PUBLISHABLE_KEY,
};

export const admin = createClient(config.supabaseUrl, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

export function createAuthClient() {
  return createClient(config.supabaseUrl, config.publicKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
