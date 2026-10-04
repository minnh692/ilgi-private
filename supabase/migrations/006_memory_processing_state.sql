-- Track whether an entry's memory processing (process-entry) has completed, so that
--  * failed runs can be picked up again later (self-healing; previously they were silently lost), and
--  * regenerating a reply doesn't re-run processing (which double-counted people mentions).

alter table entries add column memory_processed_at timestamptz;

-- Entries get their own updated_at trigger: bump updated_at only for user-visible edits, and when the
-- content changes, clear memory_processed_at so the edited entry is processed again.
-- (Updating memory_processed_at / safety_flag alone no longer touches updated_at.)
create or replace function entries_on_update()
returns trigger language plpgsql as $$
begin
  if (new.title, new.content, new.mood, new.memory_mode, new.entry_date)
     is distinct from (old.title, old.content, old.mood, old.memory_mode, old.entry_date) then
    new.updated_at = now();
    if new.content is distinct from old.content or new.title is distinct from old.title then
      new.memory_processed_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists entries_updated_at on entries;
create trigger entries_updated_at
  before update on entries
  for each row execute function entries_on_update();

-- Backfill: entries that already have insights were processed — don't re-run them all at once
update entries e
   set memory_processed_at = i.created_at
  from entry_insights i
 where i.entry_id = e.id;

-- Finds a user's unprocessed remember-mode entries (self-healing sweep in generate-reply)
create index entries_memory_unprocessed
  on entries (user_id, created_at)
  where memory_mode = 'remember' and memory_processed_at is null;
