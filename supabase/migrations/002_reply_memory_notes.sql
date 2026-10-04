-- Add memory_notes to replies (shown in 기억해둘게요 block for first entry)
alter table replies add column if not exists memory_notes text[] default '{}';
