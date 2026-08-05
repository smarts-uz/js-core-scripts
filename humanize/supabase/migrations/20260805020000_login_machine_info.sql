-- Records a full OS/user/hardware snapshot of the machine on EVERY
-- successful login, in its own table (one row per login event) — related
-- to both auth.users and public.profiles via user_id, rather than
-- overwriting a single JSONB column on profiles, so a full history of
-- every machine that has ever used an account is kept.

create table if not exists public.login_machine_info (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    logged_in_at timestamptz not null default now(),
    machine_info jsonb not null
);

create index if not exists login_machine_info_user_id_idx on public.login_machine_info (user_id);

alter table public.login_machine_info enable row level security;

-- A user may read only their own login-history rows; inserts happen only
-- via the SECURITY DEFINER function below, never a direct client insert.
create policy "login_machine_info_select_own" on public.login_machine_info
    for select
    using (auth.uid () = user_id);

-- Called right after a successful check_and_bind_fingerprint(), once the
-- login is confirmed allowed — inserts one new row per login, never
-- updates/overwrites a prior one, so login_machine_info accumulates a full
-- history rather than reflecting only the most recent machine.
create or replace function public.record_login_machine_info (p_machine_info jsonb) returns void
set search_path = '' as $$
begin
  insert into public.login_machine_info (user_id, machine_info)
  values (auth.uid (), p_machine_info);
end;
$$ language plpgsql security definer;
