-- Adds a human-readable machine name alongside the opaque fingerprint, and
-- changes check_and_bind_fingerprint's return shape from a bare boolean to
-- a JSON object carrying { allowed, bound_device_name } — so a rejected
-- login (correct password, wrong machine) can show the user WHICH machine
-- the account is actually bound to.

alter table public.profiles
add column if not exists device_name text;

drop function if exists public.check_and_bind_fingerprint (text);

create or replace function public.check_and_bind_fingerprint (
    p_fingerprint text,
    p_device_name text
) returns jsonb
set search_path = '' as $$
declare
  v_bound_fingerprint text;
  v_bound_name text;
begin
  select device_fingerprint, device_name into v_bound_fingerprint, v_bound_name
  from public.profiles
  where id = auth.uid ()
  for update;

  if v_bound_fingerprint is null then
    update public.profiles
    set device_fingerprint = p_fingerprint,
        device_name = p_device_name,
        fingerprint_bound_at = now()
    where id = auth.uid ();
    return jsonb_build_object('allowed', true, 'bound_device_name', p_device_name);
  end if;

  if v_bound_fingerprint = p_fingerprint then
    return jsonb_build_object('allowed', true, 'bound_device_name', v_bound_name);
  end if;

  return jsonb_build_object('allowed', false, 'bound_device_name', v_bound_name);
end;
$$ language plpgsql security definer;
