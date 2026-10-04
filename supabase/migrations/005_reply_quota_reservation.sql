-- Atomic reply-quota reservation.
-- Before: count usage → call Claude (seconds) → insert usage. Concurrent requests all passed the count.
-- Now: lock per user, count, and insert a 'pending' usage row in one transaction. The Edge Function
-- fills in model/tokens on success, or deletes the row (refund) if generation fails.
-- Limits live here only: free = 3 per rolling 7 days, plus = 10 per calendar day in the user's timezone.

create or replace function reserve_reply_slot(p_user_id uuid, p_plan text, p_timezone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text := p_timezone;
  v_limit int;
  v_window_start timestamptz;
  v_used int;
  v_id uuid;
begin
  -- Serialize reservations for this user until the transaction ends
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if p_plan = 'plus' then
    v_limit := 10;
    if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
      v_tz := 'Asia/Seoul';
    end if;
    -- Midnight "today" in the user's timezone (not UTC midnight = 9am KST)
    v_window_start := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  else
    v_limit := 3;
    v_window_start := now() - interval '7 days';
  end if;

  select count(*) into v_used
    from usage_events
   where user_id = p_user_id and kind = 'reply' and created_at >= v_window_start;

  if v_used >= v_limit then
    return null;
  end if;

  insert into usage_events (user_id, kind, model)
  values (p_user_id, 'reply', 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

-- Only the Edge Functions (service role) may reserve slots
revoke execute on function reserve_reply_slot(uuid, text, text) from public, anon, authenticated;
grant execute on function reserve_reply_slot(uuid, text, text) to service_role;
