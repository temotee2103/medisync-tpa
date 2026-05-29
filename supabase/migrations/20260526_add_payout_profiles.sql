create table if not exists public.member_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  account_holder_name text not null,
  bank_name text not null,
  account_number text not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id)
);

create table if not exists public.provider_payout_profiles (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  beneficiary_name text not null,
  bank_name text not null,
  account_number text not null,
  branch_name text,
  payment_reference_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id)
);

alter table public.member_payout_profiles enable row level security;
alter table public.provider_payout_profiles enable row level security;

drop policy if exists member_payout_profiles_owner_or_admin_read on public.member_payout_profiles;
create policy member_payout_profiles_owner_or_admin_read on public.member_payout_profiles
for select using (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists member_payout_profiles_owner_or_admin_write on public.member_payout_profiles;
create policy member_payout_profiles_owner_or_admin_write on public.member_payout_profiles
for all using (
  public.is_admin()
  or member_id = public.current_member_id()
)
with check (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists provider_payout_profiles_visible_to_provider_team on public.provider_payout_profiles;
create policy provider_payout_profiles_visible_to_provider_team on public.provider_payout_profiles
for select using (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_payout_profiles_manage_by_provider_team on public.provider_payout_profiles;
create policy provider_payout_profiles_manage_by_provider_team on public.provider_payout_profiles
for all using (
  public.is_admin()
  or provider_id = public.current_provider_id()
)
with check (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop trigger if exists trg_member_payout_profiles_updated_at on public.member_payout_profiles;
create trigger trg_member_payout_profiles_updated_at before update on public.member_payout_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_provider_payout_profiles_updated_at on public.provider_payout_profiles;
create trigger trg_provider_payout_profiles_updated_at before update on public.provider_payout_profiles
for each row execute procedure public.set_updated_at();
