-- Optional nickname (how 무늬 addresses the user) and birth date (for birthday wishes)
alter table profiles
  add column nickname text check (char_length(btrim(nickname)) between 1 and 20),
  add column birth_date date check (birth_date >= '1900-01-01');
