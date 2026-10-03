-- Enable required extensions
create extension if not exists "uuid-ossp";

-- Profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'plus')),
  plan_expires_at timestamptz,
  default_memory_mode text not null default 'remember'
    check (default_memory_mode in ('remember', 'reply_only', 'private')),
  consent_ai_at timestamptz,
  consent_sensitive_at timestamptz,
  consent_overseas_at timestamptz,
  timezone text not null default 'Asia/Seoul',
  reminder_time time,
  onboarding_state jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can read their own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Entries
create table entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  content text not null,
  mood smallint check (mood between 1 and 5),
  memory_mode text not null default 'remember'
    check (memory_mode in ('remember', 'reply_only', 'private')),
  prompt_used text,
  safety_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table entries enable row level security;

create policy "Users can crud their own entries"
  on entries for all using (auth.uid() = user_id);

create index entries_user_date on entries(user_id, entry_date desc);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger entries_updated_at
  before update on entries
  for each row execute function update_updated_at();

-- Replies
create table replies (
  id uuid primary key default uuid_generate_v4(),
  entry_id uuid not null references entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  kind text not null check (kind in ('normal', 'safety')),
  model text not null,
  prompt_version text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  rating smallint check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);

alter table replies enable row level security;

create policy "Users can read and rate their own replies"
  on replies for select using (auth.uid() = user_id);

create policy "Users can update rating on their own replies"
  on replies for update using (auth.uid() = user_id);

create index replies_entry_id on replies(entry_id);

-- Entry insights
create table entry_insights (
  entry_id uuid primary key references entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text not null,
  emotions jsonb not null default '[]',
  people text[] not null default '{}',
  topics text[] not null default '{}',
  events text[] not null default '{}',
  coping text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table entry_insights enable row level security;

create policy "Users can read their own insights"
  on entry_insights for select using (auth.uid() = user_id);

-- People
create table people (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  aliases text[] not null default '{}',
  relation text,
  notes text,
  mention_count integer not null default 0,
  last_mentioned_at timestamptz
);

alter table people enable row level security;

create policy "Users can crud their own people"
  on people for all using (auth.uid() = user_id);

-- Memory items
create table memory_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null
    check (category in ('theme', 'person_pattern', 'value_goal', 'what_helps', 'trigger', 'preference')),
  content text not null,
  evidence_entry_ids uuid[] not null default '{}',
  confidence real not null default 0.5,
  status text not null default 'active'
    check (status in ('active', 'user_edited', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table memory_items enable row level security;

create policy "Users can crud their own memory items"
  on memory_items for all using (auth.uid() = user_id);

create trigger memory_items_updated_at
  before update on memory_items
  for each row execute function update_updated_at();

create index memory_items_user_status on memory_items(user_id, status, confidence desc);

-- Reports
create table reports (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weekly', 'monthly')),
  period_start date not null,
  period_end date not null,
  content jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(user_id, kind, period_start)
);

alter table reports enable row level security;

create policy "Users can read their own reports"
  on reports for select using (auth.uid() = user_id);

-- Usage events
create table usage_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('reply', 'safety', 'extract', 'memory', 'report')),
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

alter table usage_events enable row level security;

create policy "Users can read their own usage"
  on usage_events for select using (auth.uid() = user_id);

create index usage_events_user_date on usage_events(user_id, created_at desc);

-- LLM cost view (for monitoring unit economics)
-- Approximate Claude pricing in USD per token (update as needed)
create or replace view llm_cost_per_user_30d as
select
  user_id,
  sum(
    (input_tokens - cache_read_tokens) * 0.000003
    + coalesce(cache_read_tokens, 0) * 0.0000003
    + output_tokens * 0.000015
  ) as approx_cost_usd,
  sum(input_tokens) as total_input_tokens,
  sum(output_tokens) as total_output_tokens,
  count(*) as total_calls
from (
  select
    ue.user_id,
    ue.input_tokens,
    ue.output_tokens,
    ue.created_at,
    coalesce(r.cache_read_tokens, 0) as cache_read_tokens
  from usage_events ue
  left join replies r on r.entry_id = (
    select entry_id from replies where id::text = ue.id::text limit 1
  )
  where ue.created_at >= now() - interval '30 days'
) sub
group by user_id;
