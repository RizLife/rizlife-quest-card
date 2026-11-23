-- Optional institutional student identifier for roster imports.
alter table public.profiles add column if not exists student_number text;
create unique index if not exists profiles_student_number_unique_idx
  on public.profiles (lower(student_number)) where student_number is not null and student_number <> '';
