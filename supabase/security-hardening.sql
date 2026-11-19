-- Apply once to existing RizLife projects after sections-migration.sql.
-- This narrows direct Supabase access to a teacher's own classes.

create or replace function public.owns_section(target_section_id bigint)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.sections where id = target_section_id and teacher_id = (select auth.uid()));
$$;

create or replace function public.is_enrolled_in_section(target_section_id bigint)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.section_students where section_id = target_section_id and student_id = (select auth.uid()));
$$;

create or replace function public.teaches_student(target_student_id uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.section_students enrollment join public.sections class on class.id = enrollment.section_id where enrollment.student_id = target_student_id and class.teacher_id = (select auth.uid()));
$$;

revoke all on function public.owns_section(bigint), public.is_enrolled_in_section(bigint), public.teaches_student(uuid) from public;
grant execute on function public.owns_section(bigint), public.is_enrolled_in_section(bigint), public.teaches_student(uuid) to authenticated;

drop policy if exists "teachers read profiles" on public.profiles;
create policy "teachers read profiles" on public.profiles for select to authenticated using ((select public.is_teacher()) and (select public.teaches_student(id)));
drop policy if exists "teachers read own sections" on public.sections;
create policy "teachers read own sections" on public.sections for select to authenticated using ((select public.owns_section(id)));
drop policy if exists "students read enrolled sections" on public.sections;
create policy "students read enrolled sections" on public.sections for select to authenticated using ((select public.is_enrolled_in_section(id)));
drop policy if exists "teachers read section enrollments" on public.section_students;
create policy "teachers read section enrollments" on public.section_students for select to authenticated using ((select public.owns_section(section_id)));
drop policy if exists "authenticated read active quests" on public.quests;
create policy "authenticated read active quests" on public.quests for select to authenticated using ((select public.owns_section(section_id)) or (active = true and (select public.is_enrolled_in_section(section_id))));
drop policy if exists "teachers create quests" on public.quests;
create policy "teachers create quests" on public.quests for insert to authenticated with check ((select public.is_teacher()) and (select public.owns_section(section_id)) and created_by = (select auth.uid()));
drop policy if exists "teachers update quests" on public.quests;
create policy "teachers update quests" on public.quests for update to authenticated using ((select public.owns_section(section_id))) with check ((select public.owns_section(section_id)));
drop policy if exists "teachers read submissions" on public.submissions;
create policy "teachers read submissions" on public.submissions for select to authenticated using (exists (select 1 from public.quests where id = submissions.quest_id and (select public.owns_section(section_id))));
