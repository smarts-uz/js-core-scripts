-- Binds each user account to the first machine it logs in from.
-- profiles.device_fingerprint is NULL until the user's first successful
-- login; check_and_bind_fingerprint() sets it then, and rejects any later
-- login attempt whose fingerprint doesn't match what was bound.

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    device_fingerprint text,
    fingerprint_bound_at timestamptz
);

alter table public.profiles enable row level security;

-- A user may read only their own profile row (needed so the RPC's caller
-- can be checked against auth.uid() inside the function body).
create policy "profiles_select_own" on public.profiles
    for select
    using (auth.uid () = id);

-- Auto-create an empty profile row the moment a new auth.users row appears,
-- so check_and_bind_fingerprint() always has a row to work with.
create or replace function public.handle_new_user () returns trigger
set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user ();

-- Called right after a successful password login. On first call for a user,
-- binds their account to `p_fingerprint` and returns true. On every later
-- call, returns true only if `p_fingerprint` matches what was bound, false
-- otherwise (a mismatch means: correct password, wrong machine).
create or replace function public.check_and_bind_fingerprint (p_fingerprint text) returns boolean
set search_path = '' as $$
declare
  v_bound text;
begin
  select device_fingerprint into v_bound
  from public.profiles
  where id = auth.uid ()
  for update;

  if v_bound is null then
    update public.profiles
    set device_fingerprint = p_fingerprint,
        fingerprint_bound_at = now()
    where id = auth.uid ();
    return true;
  end if;

  return v_bound = p_fingerprint;
end;
$$ language plpgsql security definer;
