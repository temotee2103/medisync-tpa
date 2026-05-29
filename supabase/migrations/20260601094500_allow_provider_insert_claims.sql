alter table public.claims enable row level security;

drop policy if exists claims_member_insert on public.claims;

create policy claims_portal_insert on public.claims
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = claims.member_id
      and m.profile_id = auth.uid()
  )
  or claims.provider_id = public.current_provider_id()
);
