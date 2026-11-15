-- Optional marketing consent (Korean Network Act art. 50) and the "auto" daily reminder.
-- consent_marketing_at:       opted in to advertising notifications + writing-time analysis
-- consent_marketing_night_at: separately opted in to night-time (21:00–08:00) delivery
-- reminder_auto:              reminder follows the user's usual writing time instead of reminder_time
-- Withdrawing consent sets the timestamps back to null.

alter table profiles
  add column if not exists consent_marketing_at timestamptz,
  add column if not exists consent_marketing_night_at timestamptz,
  add column if not exists reminder_auto boolean not null default false;
