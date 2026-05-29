create or replace function public.has_portal_role(target_portal text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = auth.uid()
      and pr.portal_key = target_portal
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.has_portal_role('admin');
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
as $$
  select public.has_portal_role('member');
$$;

create or replace function public.is_provider()
returns boolean
language sql
stable
as $$
  select public.has_portal_role('provider');
$$;

alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.companies enable row level security;
alter table public.members enable row level security;
alter table public.dependents enable row level security;
alter table public.providers enable row level security;
alter table public.provider_users enable row level security;
alter table public.claims enable row level security;
alter table public.claim_documents enable row level security;
alter table public.provider_claims enable row level security;
alter table public.provider_claim_documents enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write
on public.profiles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists profile_roles_select_self_or_admin on public.profile_roles;
create policy profile_roles_select_self_or_admin
on public.profile_roles
for select
using (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_roles_admin_write on public.profile_roles;
create policy profile_roles_admin_write
on public.profile_roles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_select_admin_or_member_company on public.companies;
create policy companies_select_admin_or_member_company
on public.companies
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.profile_id = auth.uid()
      and m.company_id = companies.id
  )
);

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write
on public.companies
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists members_select_self_or_admin on public.members;
create policy members_select_self_or_admin
on public.members
for select
using (public.is_admin() or profile_id = auth.uid());

drop policy if exists members_admin_write on public.members;
create policy members_admin_write
on public.members
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists dependents_select_member_or_admin on public.dependents;
create policy dependents_select_member_or_admin
on public.dependents
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = dependents.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists dependents_member_insert on public.dependents;
create policy dependents_member_insert
on public.dependents
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = dependents.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists dependents_admin_update on public.dependents;
create policy dependents_admin_update
on public.dependents
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists dependents_admin_delete on public.dependents;
create policy dependents_admin_delete
on public.dependents
for delete
using (public.is_admin());

drop policy if exists providers_select_provider_or_admin on public.providers;
create policy providers_select_provider_or_admin
on public.providers
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_users pu
    where pu.profile_id = auth.uid()
      and pu.provider_id = providers.id
  )
);

drop policy if exists providers_admin_write on public.providers;
create policy providers_admin_write
on public.providers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_users_select_self_or_admin on public.provider_users;
create policy provider_users_select_self_or_admin
on public.provider_users
for select
using (public.is_admin() or profile_id = auth.uid());

drop policy if exists provider_users_admin_write on public.provider_users;
create policy provider_users_admin_write
on public.provider_users
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists claims_select_member_or_admin on public.claims;
create policy claims_select_member_or_admin
on public.claims
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = claims.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists claims_member_insert on public.claims;
create policy claims_member_insert
on public.claims
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.members m
    where m.id = claims.member_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists claims_admin_update on public.claims;
create policy claims_admin_update
on public.claims
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists claims_admin_delete on public.claims;
create policy claims_admin_delete
on public.claims
for delete
using (public.is_admin());

drop policy if exists claim_documents_select_member_or_admin on public.claim_documents;
create policy claim_documents_select_member_or_admin
on public.claim_documents
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.claims c
    join public.members m on m.id = c.member_id
    where c.id = claim_documents.claim_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists claim_documents_member_insert on public.claim_documents;
create policy claim_documents_member_insert
on public.claim_documents
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.claims c
    join public.members m on m.id = c.member_id
    where c.id = claim_documents.claim_id
      and m.profile_id = auth.uid()
  )
);

drop policy if exists claim_documents_admin_update on public.claim_documents;
create policy claim_documents_admin_update
on public.claim_documents
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists claim_documents_admin_delete on public.claim_documents;
create policy claim_documents_admin_delete
on public.claim_documents
for delete
using (public.is_admin());

drop policy if exists provider_claims_select_provider_or_admin on public.provider_claims;
create policy provider_claims_select_provider_or_admin
on public.provider_claims
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_users pu
    where pu.id = provider_claims.provider_user_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_claims_provider_insert on public.provider_claims;
create policy provider_claims_provider_insert
on public.provider_claims
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.provider_users pu
    where pu.id = provider_claims.provider_user_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_claims_admin_update on public.provider_claims;
create policy provider_claims_admin_update
on public.provider_claims
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_claims_admin_delete on public.provider_claims;
create policy provider_claims_admin_delete
on public.provider_claims
for delete
using (public.is_admin());

drop policy if exists provider_claim_documents_select_provider_or_admin on public.provider_claim_documents;
create policy provider_claim_documents_select_provider_or_admin
on public.provider_claim_documents
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    join public.provider_users pu on pu.id = pc.provider_user_id
    where pc.id = provider_claim_documents.provider_claim_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_claim_documents_provider_insert on public.provider_claim_documents;
create policy provider_claim_documents_provider_insert
on public.provider_claim_documents
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    join public.provider_users pu on pu.id = pc.provider_user_id
    where pc.id = provider_claim_documents.provider_claim_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_claim_documents_admin_update on public.provider_claim_documents;
create policy provider_claim_documents_admin_update
on public.provider_claim_documents
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_claim_documents_admin_delete on public.provider_claim_documents;
create policy provider_claim_documents_admin_delete
on public.provider_claim_documents
for delete
using (public.is_admin());

create or replace function public.has_portal_role(target_portal text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.profile_roles pr
    where pr.profile_id = auth.uid()
      and pr.portal_key = target_portal
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_portal_role('admin');
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_portal_role('member');
$$;

create or replace function public.is_provider()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.has_portal_role('provider');
$$;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_type text not null,
  name text not null,
  status text not null default 'Active',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_items_status_check check (status = any (array['Active'::text, 'Inactive'::text]))
);

create unique index if not exists catalog_items_type_name_unique
on public.catalog_items (catalog_type, name);

alter table public.catalog_items enable row level security;

drop policy if exists catalog_items_select_admin_or_provider on public.catalog_items;
create policy catalog_items_select_admin_or_provider
on public.catalog_items
for select
using (public.is_admin() or public.is_provider());

drop policy if exists catalog_items_admin_write on public.catalog_items;
create policy catalog_items_admin_write
on public.catalog_items
for all
using (public.is_admin())
with check (public.is_admin());

alter table public.companies
add column if not exists contact_phone_name text null;

alter table public.companies
add column if not exists contact_phone_secondary_name text null;

create table if not exists public.dependent_requests (
  id uuid primary key default gen_random_uuid(),
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid null references public.members(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null
);

create index if not exists idx_dependent_requests_member_profile_id on public.dependent_requests(member_profile_id);
create index if not exists idx_dependent_requests_company_id on public.dependent_requests(company_id);
create index if not exists idx_dependent_requests_status on public.dependent_requests(status);

alter table public.dependent_requests enable row level security;

drop policy if exists "dependent_requests_member_select_own" on public.dependent_requests;
create policy "dependent_requests_member_select_own"
on public.dependent_requests
for select
to authenticated
using (public.is_member() and member_profile_id = auth.uid());

drop policy if exists "dependent_requests_member_insert_own" on public.dependent_requests;
create policy "dependent_requests_member_insert_own"
on public.dependent_requests
for insert
to authenticated
with check (public.is_member() and member_profile_id = auth.uid());

drop policy if exists "dependent_requests_admin_all" on public.dependent_requests;
create policy "dependent_requests_admin_all"
on public.dependent_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.diagnosis_options (
  diagnosis text primary key,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diagnosis_options_status on public.diagnosis_options(status);

alter table public.diagnosis_options enable row level security;

drop policy if exists "diagnosis_options_authenticated_select" on public.diagnosis_options;
create policy "diagnosis_options_authenticated_select"
on public.diagnosis_options
for select
to authenticated
using (true);

drop policy if exists "diagnosis_options_admin_write" on public.diagnosis_options;
create policy "diagnosis_options_admin_write"
on public.diagnosis_options
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.diagnosis_options (diagnosis)
values
  ('Acute Upper Respiratory Infection'),
  ('Acute Gastritis'),
  ('Viral Fever'),
  ('Hypertension'),
  ('Type 2 Diabetes Mellitus'),
  ('Migraine'),
  ('Allergic Rhinitis'),
  ('Acute Pharyngitis'),
  ('Conjunctivitis'),
  ('Low Back Pain')
on conflict (diagnosis) do nothing;

create table if not exists public.entitlement_locks (
  claim_id text primary key,
  member_key text not null,
  category text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_entitlement_locks_member_key on public.entitlement_locks(member_key);
create index if not exists idx_entitlement_locks_category on public.entitlement_locks(category);

create table if not exists public.entitlement_utilizations (
  claim_id text primary key,
  member_key text not null,
  category text not null,
  amount numeric not null default 0,
  approved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entitlement_utilizations_member_key on public.entitlement_utilizations(member_key);
create index if not exists idx_entitlement_utilizations_category on public.entitlement_utilizations(category);
create index if not exists idx_entitlement_utilizations_approved_at on public.entitlement_utilizations(approved_at);

alter table public.entitlement_locks enable row level security;
alter table public.entitlement_utilizations enable row level security;

drop policy if exists "entitlement_locks_authenticated_all" on public.entitlement_locks;
create policy "entitlement_locks_authenticated_all"
on public.entitlement_locks
for all
to authenticated
using (true)
with check (true);

drop policy if exists "entitlement_utilizations_authenticated_all" on public.entitlement_utilizations;
create policy "entitlement_utilizations_authenticated_all"
on public.entitlement_utilizations
for all
to authenticated
using (true)
with check (true);

alter table public.companies
  add column if not exists registration_no_old text,
  add column if not exists tin_number text,
  add column if not exists sst_number text,
  add column if not exists ssm_file_name text,
  add column if not exists ssm_expiry_date date,
  add column if not exists industry text,
  add column if not exists plan_config jsonb not null default '{}'::jsonb;

create table if not exists public.panel_visit_transactions (
  id text primary key,
  claim_id text not null,
  provider_id text null,
  member_key text not null,
  patient_id text not null,
  patient_name text not null,
  visit_datetime timestamptz not null,
  service_type text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_panel_visit_transactions_member_key on public.panel_visit_transactions(member_key);
create index if not exists idx_panel_visit_transactions_claim_id on public.panel_visit_transactions(claim_id);
create index if not exists idx_panel_visit_transactions_created_at on public.panel_visit_transactions(created_at);

alter table public.panel_visit_transactions enable row level security;

drop policy if exists "panel_visit_transactions_authenticated_all" on public.panel_visit_transactions;
create policy "panel_visit_transactions_authenticated_all"
on public.panel_visit_transactions
for all
to authenticated
using (true)
with check (true);

create table if not exists public.passport_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  member_profile_id uuid not null references public.profiles(id) on delete cascade,
  member_id uuid null references public.members(id) on delete set null,
  company_id uuid null references public.companies(id) on delete set null,
  staff_id text null,
  full_name text null,
  current_expiry date null,
  new_expiry date null,
  file_name text null,
  storage_path text null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz null,
  reviewed_by_profile_id uuid null references public.profiles(id) on delete set null,
  review_note text null
);

create index if not exists idx_passport_renewal_requests_member_profile_id on public.passport_renewal_requests(member_profile_id);
create index if not exists idx_passport_renewal_requests_company_id on public.passport_renewal_requests(company_id);
create index if not exists idx_passport_renewal_requests_status on public.passport_renewal_requests(status);

alter table public.passport_renewal_requests enable row level security;

drop policy if exists "passport_renewal_requests_member_select_own" on public.passport_renewal_requests;
create policy "passport_renewal_requests_member_select_own"
on public.passport_renewal_requests
for select
to authenticated
using (public.is_member() and member_profile_id = auth.uid());

drop policy if exists "passport_renewal_requests_member_insert_own" on public.passport_renewal_requests;
create policy "passport_renewal_requests_member_insert_own"
on public.passport_renewal_requests
for insert
to authenticated
with check (public.is_member() and member_profile_id = auth.uid());

drop policy if exists "passport_renewal_requests_admin_all" on public.passport_renewal_requests;
create policy "passport_renewal_requests_admin_all"
on public.passport_renewal_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create table if not exists public.provider_invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  provider_profile_id uuid not null references public.profiles(id) on delete cascade,
  draft_key text not null default 'default',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_profile_id, draft_key)
);

create index if not exists idx_provider_invoice_drafts_provider_profile_id on public.provider_invoice_drafts(provider_profile_id);

alter table public.provider_invoice_drafts enable row level security;

drop policy if exists "provider_invoice_drafts_owner_all" on public.provider_invoice_drafts;
create policy "provider_invoice_drafts_owner_all"
on public.provider_invoice_drafts
for all
to authenticated
using (public.is_provider() and provider_profile_id = auth.uid())
with check (public.is_provider() and provider_profile_id = auth.uid());

alter table public.admin_users enable row level security;
alter table public.admin_accounts enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.provider_credentials enable row level security;

drop policy if exists admin_users_admin_all on public.admin_users;
create policy admin_users_admin_all
on public.admin_users
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_accounts_admin_all on public.admin_accounts;
create policy admin_accounts_admin_all
on public.admin_accounts
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists admin_audit_logs_admin_all on public.admin_audit_logs;
create policy admin_audit_logs_admin_all
on public.admin_audit_logs
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_credentials_select_provider_or_admin on public.provider_credentials;
create policy provider_credentials_select_provider_or_admin
on public.provider_credentials
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_users pu
    where pu.id = provider_credentials.provider_user_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_credentials_provider_insert on public.provider_credentials;
create policy provider_credentials_provider_insert
on public.provider_credentials
for insert
with check (
  public.is_admin()
  or exists (
    select 1
    from public.provider_users pu
    where pu.id = provider_credentials.provider_user_id
      and pu.profile_id = auth.uid()
  )
);

drop policy if exists provider_credentials_admin_update on public.provider_credentials;
create policy provider_credentials_admin_update
on public.provider_credentials
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_credentials_admin_delete on public.provider_credentials;
create policy provider_credentials_admin_delete
on public.provider_credentials
for delete
using (public.is_admin());

create table if not exists public.service_type_rules (
  service_type text primary key,
  allowed_sections text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_type_rules enable row level security;

drop policy if exists "service_type_rules_read_authenticated" on public.service_type_rules;
create policy "service_type_rules_read_authenticated"
on public.service_type_rules
for select
to authenticated
using (true);

drop policy if exists "service_type_rules_admin_write" on public.service_type_rules;
create policy "service_type_rules_admin_write"
on public.service_type_rules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.service_type_rules (service_type, allowed_sections)
values
  ('Annual Health Screening (AHS)', array['consultation']),
  ('Outpatient (OP)', array['consultation','medication','injection','investigation','procedure','immunization']),
  ('Specialist Referral (SF)', array['consultation','medication','injection','investigation','procedure','immunization']),
  ('Dental', array['consultation','medication','injection','procedure']),
  ('Traditional Chinese Medicine (TCM)', array['consultation','medication','procedure']),
  ('Rehabilitation', array['consultation']),
  ('Optical', array['consultation']),
  ('Others', array['consultation','medication','injection','investigation','procedure','immunization'])
on conflict (service_type) do update
set allowed_sections = excluded.allowed_sections,
    updated_at = now();

create unique index if not exists idx_members_staff_id_unique
on public.members (staff_id);

create unique index if not exists idx_provider_users_member_code_unique
on public.provider_users (member_code);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'dependents_member_import_key_unique'
      and conrelid = 'public.dependents'::regclass
  ) then
    return;
  end if;

  delete from public.dependents d
  using (
    select id
    from (
      select
        id,
        row_number() over (
          partition by member_id, import_key
          order by updated_at desc nulls last, created_at desc nulls last
        ) as rn
      from public.dependents
      where member_id is not null
        and import_key is not null
    ) ranked
    where ranked.rn > 1
  ) dup
  where d.id = dup.id;

  alter table public.dependents
    add constraint dependents_member_import_key_unique
    unique (member_id, import_key);
end $$;
