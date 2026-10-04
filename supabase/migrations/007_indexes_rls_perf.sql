-- Performance for growing data.

-- 1) Missing per-user indexes for hot queries
--    entry_insights: buildContext() reads a user's recent summaries ordered by created_at
create index if not exists entry_insights_user_created on entry_insights (user_id, created_at desc);
--    people: buildContext() / process-entry load all of a user's people
create index if not exists people_user on people (user_id);
--    replies: generate-reply reads a user's last reply openings
create index if not exists replies_user_created on replies (user_id, created_at desc);
--    (reports is already covered by its unique (user_id, kind, period_start) index)

-- 2) RLS: wrap auth.uid() in a subselect so Postgres evaluates it once per query instead of once
--    per row (Supabase's recommended pattern). Policy semantics are unchanged.

drop policy "Users can read their own profile" on profiles;
create policy "Users can read their own profile"
  on profiles for select using ((select auth.uid()) = id);

drop policy "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert with check ((select auth.uid()) = id);

drop policy "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update using ((select auth.uid()) = id);

drop policy "Users can crud their own entries" on entries;
create policy "Users can crud their own entries"
  on entries for all using ((select auth.uid()) = user_id);

drop policy "Users can read and rate their own replies" on replies;
create policy "Users can read and rate their own replies"
  on replies for select using ((select auth.uid()) = user_id);

drop policy "Users can update rating on their own replies" on replies;
create policy "Users can update rating on their own replies"
  on replies for update using ((select auth.uid()) = user_id);

drop policy "Users can read their own insights" on entry_insights;
create policy "Users can read their own insights"
  on entry_insights for select using ((select auth.uid()) = user_id);

drop policy "Users can crud their own people" on people;
create policy "Users can crud their own people"
  on people for all using ((select auth.uid()) = user_id);

drop policy "Users can crud their own memory items" on memory_items;
create policy "Users can crud their own memory items"
  on memory_items for all using ((select auth.uid()) = user_id);

drop policy "Users can read their own reports" on reports;
create policy "Users can read their own reports"
  on reports for select using ((select auth.uid()) = user_id);

drop policy "Users can read their own usage" on usage_events;
create policy "Users can read their own usage"
  on usage_events for select using ((select auth.uid()) = user_id);
