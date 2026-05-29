alter table public.members enable row level security;

drop policy if exists members_select_self_or_admin on public.members;
drop policy if exists members_owner_or_admin_read on public.members;

create policy members_portal_read on public.members
for select
using (
  public.is_admin()
  or profile_id = auth.uid()
  or exists (
    select 1
    from public.provider_users pu
    where pu.profile_id = auth.uid()
      and pu.status = 'active'
  )
);

alter table public.dependents enable row level security;

drop policy if exists dependents_select_member_or_admin on public.dependents;
drop policy if exists dependents_owner_or_admin_read on public.dependents;

create policy dependents_portal_read on public.dependents
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = dependents.member_id
      and m.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.provider_users pu
    where pu.profile_id = auth.uid()
      and pu.status = 'active'
  )
);
