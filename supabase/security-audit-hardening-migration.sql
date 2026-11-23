-- Prepared by the 2026-11-23 security audit.
-- Review and back up the database before running this in Supabase SQL Editor.
-- This migration does not delete or rewrite application data.

begin;

-- A disabled or demoted teacher must immediately lose direct database access.
create or replace function public.owns_section(target_section_id bigint)
returns boolean language sql security definer stable set search_path = '' as $$
  select (select public.is_teacher()) and exists (
    select 1 from public.sections
    where id = target_section_id and teacher_id = (select auth.uid())
  );
$$;

-- Direct Supabase inserts must enforce the same enrollment and active-quest
-- checks already enforced by the RizLife server API.
drop policy if exists "students submit own evidence" on public.submissions;
create policy "students submit own evidence" on public.submissions for insert to authenticated
with check (
  student_id = (select auth.uid())
  and status = 'submitted'
  and feedback is null
  and reviewed_at is null
  and reviewed_by is null
  and exists (
    select 1
    from public.quests quest
    join public.section_students enrollment
      on enrollment.section_id = quest.section_id
    where quest.id = submissions.quest_id
      and quest.active = true
      and enrollment.student_id = (select auth.uid())
  )
);

commit;
