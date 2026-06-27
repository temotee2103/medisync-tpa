-- Add RLS policies for member_payout_profiles
-- Tables already exist from manual SQL, this adds missing policies

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

-- Add RLS policies for provider_payout_profiles
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

-- Add updated_at triggers
drop trigger if exists trg_member_payout_profiles_updated_at on public.member_payout_profiles;
create trigger trg_member_payout_profiles_updated_at before update on public.member_payout_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_provider_payout_profiles_updated_at on public.provider_payout_profiles;
create trigger trg_provider_payout_profiles_updated_at before update on public.provider_payout_profiles
for each row execute procedure public.set_updated_at();
