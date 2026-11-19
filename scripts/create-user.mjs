import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [,, email, password, name, role='student'] = process.argv;
if (!email || !password || !name || !['student','teacher'].includes(role)) {
  console.error('Usage: npm run create-user -- <email> <password> "Full Name" [student|teacher]');
  process.exit(1);
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error('Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env first.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false }
});
const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm:true });
if (error) throw error;
const { error: profileError } = await supabase.from('profiles').insert({ id:data.user.id, name, role });
if (profileError) {
  await supabase.auth.admin.deleteUser(data.user.id);
  throw profileError;
}
console.log(`Created ${role}: ${name} <${email}>`);
