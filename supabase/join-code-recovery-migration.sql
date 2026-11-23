-- Run once in Supabase Dashboard > SQL Editor after join-codes-migration.sql.
-- Older codes were deliberately stored as hashes only, so their original text cannot be recovered.
-- Teachers should replace any older active code once after this migration.
alter table public.section_join_codes
  add column if not exists code text;

alter table public.section_join_codes
  drop constraint if exists section_join_codes_code_format_check;
alter table public.section_join_codes
  add constraint section_join_codes_code_format_check
  check (code is null or code ~ '^RZ-[A-F0-9]{6}-[A-F0-9]{6}$');
