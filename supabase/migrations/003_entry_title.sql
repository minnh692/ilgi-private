-- Optional user-written title for a diary entry
alter table entries add column title text check (char_length(title) <= 100);
