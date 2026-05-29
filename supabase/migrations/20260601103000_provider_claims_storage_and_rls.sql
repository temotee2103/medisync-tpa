insert into storage.buckets (id, name, public)
values ('provider-claim-documents', 'provider-claim-documents', false)
on conflict (id) do nothing;

drop policy if exists provider_claim_documents_storage_select on storage.objects;
drop policy if exists provider_claim_documents_storage_insert on storage.objects;
drop policy if exists provider_claim_documents_storage_update on storage.objects;
drop policy if exists provider_claim_documents_storage_delete on storage.objects;

create policy provider_claim_documents_storage_select on storage.objects
for select to authenticated using (
  bucket_id = 'provider-claim-documents'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'provider-claims'
      and (storage.foldername(name))[2] = public.current_provider_id()::text
    )
  )
);

create policy provider_claim_documents_storage_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'provider-claim-documents'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'provider-claims'
      and (storage.foldername(name))[2] = public.current_provider_id()::text
    )
  )
);

create policy provider_claim_documents_storage_update on storage.objects
for update to authenticated using (
  bucket_id = 'provider-claim-documents'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'provider-claims'
      and (storage.foldername(name))[2] = public.current_provider_id()::text
    )
  )
)
with check (
  bucket_id = 'provider-claim-documents'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'provider-claims'
      and (storage.foldername(name))[2] = public.current_provider_id()::text
    )
  )
);

create policy provider_claim_documents_storage_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'provider-claim-documents'
  and (
    public.is_admin()
    or (
      (storage.foldername(name))[1] = 'provider-claims'
      and (storage.foldername(name))[2] = public.current_provider_id()::text
    )
  )
);

drop policy if exists provider_claims_insert_by_provider_or_admin on public.provider_claims;
drop policy if exists provider_claims_visible_to_provider_or_admin on public.provider_claims;
drop policy if exists provider_claims_update_by_provider_or_admin on public.provider_claims;

create policy provider_claims_visible_to_provider_or_admin on public.provider_claims
for select using (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

create policy provider_claims_insert_by_provider_or_admin on public.provider_claims
for insert with check (
  public.is_admin()
  or (
    provider_id = public.current_provider_id()
    and submitted_by_profile_id = auth.uid()
  )
);

create policy provider_claims_update_by_provider_or_admin on public.provider_claims
for update using (
  public.is_admin()
  or (
    provider_id = public.current_provider_id()
    and status in ('draft', 'submitted', 'request_additional_information')
  )
)
with check (
  public.is_admin()
  or (
    provider_id = public.current_provider_id()
    and status in ('draft', 'submitted', 'request_additional_information')
  )
);

drop policy if exists provider_claim_documents_visible_to_provider_or_admin on public.provider_claim_documents;
drop policy if exists provider_claim_documents_insert_by_provider_or_admin on public.provider_claim_documents;

create policy provider_claim_documents_visible_to_provider_or_admin on public.provider_claim_documents
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    where pc.id = provider_claim_documents.provider_claim_id
      and pc.provider_id = public.current_provider_id()
  )
);

create policy provider_claim_documents_insert_by_provider_or_admin on public.provider_claim_documents
for insert with check (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    where pc.id = provider_claim_documents.provider_claim_id
      and pc.provider_id = public.current_provider_id()
      and pc.submitted_by_profile_id = auth.uid()
  )
);

drop policy if exists claims_portal_insert on public.claims;
drop policy if exists claims_member_insert on public.claims;
drop policy if exists claims_insert_admin_only on public.claims;

create policy claims_insert_admin_only on public.claims
for insert with check (public.is_admin());
