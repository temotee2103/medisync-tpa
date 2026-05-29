create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.companies
  add column if not exists hr_name text;

alter table public.system_settings enable row level security;

drop policy if exists system_settings_admin_all on public.system_settings;
create policy system_settings_admin_all
on public.system_settings
for all
using (public.is_admin())
with check (public.is_admin());
