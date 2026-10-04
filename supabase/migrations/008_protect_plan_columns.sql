-- The "Users can update their own profile" RLS policy covers every column, so the app could set
-- its own plan to 'plus'. Subscription state must only come from the server (revenuecat-webhook,
-- running as service_role). This trigger pins plan columns for client roles; the rest of the
-- profile stays user-editable, and existing client upserts keep working.

create or replace function protect_profile_plan()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.plan := 'free';
      new.plan_expires_at := null;
    else
      new.plan := old.plan;
      new.plan_expires_at := old.plan_expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_plan on profiles;
create trigger profiles_protect_plan
  before insert or update on profiles
  for each row execute function protect_profile_plan();
