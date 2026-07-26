-- ============================================================
-- Data model hardening, phase 1 (backward compatible)
--
-- Rules for this phase:
--   * no existing table or column is removed;
--   * current IDs, users, admins, threads and messages are preserved;
--   * new structures are backfilled before the application reads them;
--   * legacy fields/RPCs remain available during the rollout.
-- ============================================================

set lock_timeout = '5s';
set statement_timeout = '2min';

-- --------------------------------------------------------------------------
-- 1. Private GPT runtime configuration.
--
-- Keep the legacy columns in `gpts` during the compatibility window. A trigger
-- mirrors every admin write into this server-only table, and the app can fall
-- back to the old columns if it is ever connected to a database that has not
-- received this migration yet.
-- --------------------------------------------------------------------------

create table if not exists public.gpt_private_config (
  gpt_id uuid primary key references public.gpts(id) on delete cascade,
  system_prompt text not null,
  model text not null default 'gpt-4.1-mini',
  tools_enabled jsonb not null default
    '{"file_search": true, "code_interpreter": true}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.gpt_private_config enable row level security;

insert into public.gpt_private_config (
  gpt_id,
  system_prompt,
  model,
  tools_enabled
)
select
  id,
  coalesce(system_prompt, ''),
  coalesce(model, 'gpt-4.1-mini'),
  coalesce(
    tools_enabled,
    '{"file_search": true, "code_interpreter": true}'::jsonb
  )
from public.gpts
on conflict (gpt_id) do update
set system_prompt = excluded.system_prompt,
    model = excluded.model,
    tools_enabled = excluded.tools_enabled,
    updated_at = now();

create or replace function public.sync_gpt_private_config()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  insert into public.gpt_private_config (
    gpt_id,
    system_prompt,
    model,
    tools_enabled
  )
  values (
    new.id,
    coalesce(new.system_prompt, ''),
    coalesce(new.model, 'gpt-4.1-mini'),
    coalesce(
      new.tools_enabled,
      '{"file_search": true, "code_interpreter": true}'::jsonb
    )
  )
  on conflict (gpt_id) do update
  set system_prompt = excluded.system_prompt,
      model = excluded.model,
      tools_enabled = excluded.tools_enabled,
      updated_at = now();

  return new;
end;
$function$;

drop trigger if exists sync_gpt_private_config_after_write on public.gpts;
create trigger sync_gpt_private_config_after_write
after insert or update of system_prompt, model, tools_enabled on public.gpts
for each row execute function public.sync_gpt_private_config();

revoke execute on function public.sync_gpt_private_config()
  from public, anon, authenticated;
revoke all on table public.gpt_private_config
  from public, anon, authenticated;
grant all on table public.gpt_private_config to service_role;

-- --------------------------------------------------------------------------
-- 2. Thread leases.
--
-- The previous status-only lock expired after two minutes while a Vercel
-- request can legitimately run for five. A token prevents an older request
-- from releasing a newer request's lease.
-- --------------------------------------------------------------------------

alter table public.threads
  add column if not exists lock_token uuid,
  add column if not exists lock_expires_at timestamptz;

create or replace function public.acquire_thread_lease(p_thread_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.threads
     set status = 'streaming',
         status_changed_at = now(),
         lock_token = v_token,
         lock_expires_at = now() + interval '7 minutes'
   where id = p_thread_id
     and user_id = (select auth.uid())
     and (
       status = 'idle'
       or lock_expires_at <= now()
       or (
         lock_expires_at is null
         and status_changed_at < now() - interval '7 minutes'
       )
     );

  if found then
    return v_token;
  end if;
  return null;
end;
$function$;

create or replace function public.release_thread_lease(
  p_thread_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.threads
     set status = 'idle',
         status_changed_at = now(),
         lock_token = null,
         lock_expires_at = null
   where id = p_thread_id
     and user_id = (select auth.uid())
     and lock_token = p_lock_token;

  return found;
end;
$function$;

-- Harden the compatibility RPCs while old application instances drain.
create or replace function public.acquire_thread_lock(
  p_thread_id uuid,
  stale_after interval default interval '7 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer;
begin
  update public.threads
     set status = 'streaming',
         status_changed_at = now()
   where id = p_thread_id
     and user_id = (select auth.uid())
     and lock_token is null
     and (
       status = 'idle'
       or status_changed_at < now() - greatest(stale_after, interval '7 minutes')
     );
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$function$;

create or replace function public.release_thread_lock(p_thread_id uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.threads
     set status = 'idle',
         status_changed_at = now()
   where id = p_thread_id
     and user_id = (select auth.uid())
     and lock_token is null;
$function$;

revoke execute on function public.acquire_thread_lease(uuid)
  from public, anon;
revoke execute on function public.release_thread_lease(uuid, uuid)
  from public, anon;
grant execute on function public.acquire_thread_lease(uuid)
  to authenticated, service_role;
grant execute on function public.release_thread_lease(uuid, uuid)
  to authenticated, service_role;

-- --------------------------------------------------------------------------
-- 3. Normalized attachment relationship.
--
-- `messages.files` remains in place as the read/write compatibility format.
-- This table adds database-enforced relationships and is backfilled from JSON.
-- --------------------------------------------------------------------------

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  openai_file_id text not null
    references public.uploaded_files(openai_file_id) on delete restrict,
  position smallint not null,
  kind text not null check (kind in ('image', 'document')),
  created_at timestamptz not null default now(),
  unique (message_id, position)
);

alter table public.message_attachments enable row level security;

drop policy if exists "users read own message attachments"
  on public.message_attachments;
create policy "users read own message attachments"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages
      where messages.id = message_attachments.message_id
        and messages.user_id = (select auth.uid())
    )
  );

insert into public.message_attachments (
  message_id,
  openai_file_id,
  position,
  kind
)
select
  m.id,
  item.value->>'openai_file_id',
  (item.ordinality - 1)::smallint,
  case
    when coalesce(item.value->>'type', '') = 'image'
      or u.mime like 'image/%'
    then 'image'
    else 'document'
  end
from public.messages m
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(m.files) = 'array' then m.files
    else '[]'::jsonb
  end
) with ordinality as item(value, ordinality)
join public.uploaded_files u
  on u.openai_file_id = item.value->>'openai_file_id'
where item.value ? 'openai_file_id'
on conflict (message_id, position) do nothing;

create index if not exists idx_message_attachments_file
  on public.message_attachments(openai_file_id);

revoke all on table public.message_attachments from public, anon;
revoke insert, update, delete on table public.message_attachments
  from authenticated;
grant select on table public.message_attachments to authenticated;
grant all on table public.message_attachments to service_role;

-- --------------------------------------------------------------------------
-- 4. Integrity constraints. NOT VALID enforces new writes immediately and
-- validates the existing, already-audited rows without rewriting the tables.
-- --------------------------------------------------------------------------

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'threads_user_id_required'
      and conrelid = 'public.threads'::regclass
  ) then
    alter table public.threads
      add constraint threads_user_id_required
      check (user_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'threads_gpt_id_required'
      and conrelid = 'public.threads'::regclass
  ) then
    alter table public.threads
      add constraint threads_gpt_id_required
      check (gpt_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'threads_status_valid'
      and conrelid = 'public.threads'::regclass
  ) then
    alter table public.threads
      add constraint threads_status_valid
      check (status in ('idle', 'streaming')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'uploaded_files_user_id_required'
      and conrelid = 'public.uploaded_files'::regclass
  ) then
    alter table public.uploaded_files
      add constraint uploaded_files_user_id_required
      check (user_id is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'allowed_members_limit_nonnegative'
      and conrelid = 'public.allowed_members'::regclass
  ) then
    alter table public.allowed_members
      add constraint allowed_members_limit_nonnegative
      check (monthly_message_limit is null or monthly_message_limit >= 0)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usage_values_nonnegative'
      and conrelid = 'public.usage_events'::regclass
  ) then
    alter table public.usage_events
      add constraint usage_values_nonnegative
      check (
        (tokens_in is null or tokens_in >= 0)
        and (tokens_out is null or tokens_out >= 0)
        and (cost is null or cost >= 0)
      ) not valid;
  end if;
end
$block$;

alter table public.threads validate constraint threads_user_id_required;
alter table public.threads validate constraint threads_gpt_id_required;
alter table public.threads validate constraint threads_status_valid;
alter table public.uploaded_files
  validate constraint uploaded_files_user_id_required;
alter table public.allowed_members
  validate constraint allowed_members_limit_nonnegative;
alter table public.usage_events
  validate constraint usage_values_nonnegative;

create unique index if not exists idx_threads_id_user_unique
  on public.threads(id, user_id);

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_thread_owner_fkey'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_thread_owner_fkey
      foreign key (thread_id, user_id)
      references public.threads(id, user_id)
      on delete cascade
      not valid;
  end if;
end
$block$;

alter table public.messages
  validate constraint messages_thread_owner_fkey;

-- --------------------------------------------------------------------------
-- 5. Uniqueness and query-path indexes. The preflight audit checks for
-- duplicates before this migration is pushed.
-- --------------------------------------------------------------------------

create unique index if not exists idx_threads_openai_conversation_unique
  on public.threads(openai_conversation_id)
  where openai_conversation_id is not null;

create unique index if not exists idx_uploaded_files_user_storage_unique
  on public.uploaded_files(user_id, storage_path);

create index if not exists idx_messages_monthly_quota
  on public.messages(user_id, created_at)
  where role = 'assistant';

create index if not exists idx_threads_user_gpt_updated
  on public.threads(user_id, gpt_id, updated_at desc);

create index if not exists idx_gpts_active_order
  on public.gpts(sort_order, created_at desc)
  where is_active = true;

-- `email text unique` already creates an equivalent btree.
drop index if exists public.idx_allowed_members_email;

-- --------------------------------------------------------------------------
-- 6. Explicit Data API privileges.
--
-- Existing application reads are preserved. Tables that are server-only stay
-- inaccessible even if a future Supabase project enables broad default grants.
-- --------------------------------------------------------------------------

revoke all on table public.allowed_members from anon, authenticated;
revoke all on table public.usage_events from anon, authenticated;
revoke all on table public.uploaded_files from anon, authenticated;
revoke all on table public.webhook_events from anon, authenticated;
revoke all on table public.auth_events from anon, authenticated;

revoke all on table public.gpts from anon, authenticated;
grant select (
  id,
  name,
  description,
  category,
  icon_url,
  tools_enabled,
  vision_enabled,
  conversation_starters,
  is_active,
  sort_order,
  created_at,
  author
) on table public.gpts to anon, authenticated;

revoke all on table public.gpts_public from anon, authenticated;
grant select on table public.gpts_public to anon, authenticated;

revoke all on table public.threads from anon, authenticated;
grant select, insert, update, delete on table public.threads to authenticated;

revoke all on table public.messages from anon, authenticated;
grant select on table public.messages to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;

revoke all on table public.app_settings from anon, authenticated;
grant select on table public.app_settings to anon, authenticated;

grant execute on function public.latest_messages_for_threads(uuid[])
  to authenticated, service_role;
revoke execute on function public.latest_messages_for_threads(uuid[])
  from public, anon;
