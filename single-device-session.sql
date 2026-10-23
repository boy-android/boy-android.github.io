-- Run this once in Supabase SQL Editor before deploying the website changes.
-- A user stays bound to the first browser profile that claims the account.
-- To manually unlock a user after they lose browser storage, run:
-- delete from public.account_device_locks where user_id = '<AUTH_USER_UUID>';

create table if not exists public.account_device_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  claimed_at timestamptz not null default now()
);

alter table public.account_device_locks enable row level security;

revoke all on table public.account_device_locks from anon, authenticated;

create or replace function public.claim_account_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_id uuid;
begin
  if v_user_id is null or p_device_id is null then
    return false;
  end if;

  insert into public.account_device_locks (user_id, device_id)
  values (v_user_id, p_device_id)
  on conflict (user_id) do nothing;

  select device_id into v_device_id
  from public.account_device_locks
  where user_id = v_user_id;

  if v_device_id = p_device_id then
    return true;
  end if;

  -- Revoke the newly created Auth session that failed the admission check.
  -- Existing sessions belonging to the already-registered browser stay active.
  if (auth.jwt() ->> 'session_id') is not null then
    delete from auth.sessions
    where id = ((auth.jwt() ->> 'session_id')::uuid)
      and user_id = v_user_id;
  end if;

  return false;
end;
$$;

create or replace function public.release_account_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_device_id is null then
    return false;
  end if;

  delete from public.account_device_locks
  where user_id = v_user_id and device_id = p_device_id;

  return found;
end;
$$;

revoke all on function public.claim_account_device(uuid) from public, anon;
revoke all on function public.release_account_device(uuid) from public, anon;
grant execute on function public.claim_account_device(uuid) to authenticated;
grant execute on function public.release_account_device(uuid) to authenticated;
