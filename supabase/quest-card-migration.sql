-- Adds stable Quest Card slots to an existing RizLife project.
-- Run once in Supabase Dashboard > SQL Editor before deploying the Quest Card code.
-- Existing quests are assigned slots 1-24 per class, with active quests first.

begin;

alter table public.quests add column if not exists quest_slot smallint;

do $$
begin
  if exists (
    select section_id
    from public.quests
    group by section_id
    having count(*) > 24
  ) then
    raise exception 'Quest Card supports at most 24 quests per class. Archive or remove extra quests before running this migration.';
  end if;
end $$;

with numbered as (
  select id,
    row_number() over (
      partition by section_id
      order by active desc, created_at, id
    )::smallint as assigned_slot
  from public.quests
)
update public.quests quest
set quest_slot = numbered.assigned_slot
from numbered
where quest.id = numbered.id
  and quest.quest_slot is null;

alter table public.quests
  drop constraint if exists quests_quest_slot_check;
alter table public.quests
  add constraint quests_quest_slot_check check (quest_slot between 1 and 24);
alter table public.quests alter column quest_slot set not null;

create unique index if not exists quests_section_slot_unique_idx
  on public.quests(section_id, quest_slot);

commit;
