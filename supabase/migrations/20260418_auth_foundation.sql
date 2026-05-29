create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique,
  full_name text,
  avatar_url text,
  status text not null default 'active' check (status in ('active', 'disabled', 'pending')),
  default_portal text not null default 'member' check (default_portal in ('admin', 'member', 'provider')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.profile_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  portal_key text not null check (portal_key in ('admin', 'member', 'provider')),
  role_key text not null,
  is_primary boolean not null default false,
  created_at timestamp with time zone not null default now(),
  unique (profile_id, role_key)
);

create index if not exists idx_profile_roles_profile_id on public.profile_roles(profile_id);
create index if not exists idx_profile_roles_portal_role on public.profile_roles(portal_key, role_key);

insert into public.profiles (id, email, full_name, default_portal)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  coalesce(u.raw_user_meta_data ->> 'default_portal', 'member')
from auth.users u
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
  default_portal = coalesce(nullif(excluded.default_portal, ''), public.profiles.default_portal),
  updated_at = now();

create or replace function public.sync_auth_user_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, default_portal)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.raw_user_meta_data ->> 'default_portal', 'member')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
    default_portal = coalesce(nullif(excluded.default_portal, ''), public.profiles.default_portal),
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
after insert or update on auth.users
for each row execute procedure public.sync_auth_user_to_profile();

alter table public.admin_users
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists email citext,
  add column if not exists updated_at timestamp with time zone not null default now();

create unique index if not exists idx_admin_users_profile_id on public.admin_users(profile_id) where profile_id is not null;

alter table public.companies
  add column if not exists registration_no text,
  add column if not exists contact_person text,
  add column if not exists contact_email citext,
  add column if not exists contact_phone text,
  add column if not exists contact_phone_secondary text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'Malaysia',
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.members
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists dob date,
  add column if not exists gender text check (gender in ('Male', 'Female', 'Other')),
  add column if not exists relationship text default 'Employee',
  add column if not exists passport_no text,
  add column if not exists passport_file_path text,
  add column if not exists plan_selection jsonb not null default '{}'::jsonb,
  add column if not exists plan_limits jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamp with time zone not null default now();

create unique index if not exists idx_members_profile_id on public.members(profile_id) where profile_id is not null;

alter table public.dependents
  add column if not exists nationality text default 'Malaysia',
  add column if not exists passport_no text,
  add column if not exists passport_expiry_date date,
  add column if not exists passport_file_path text,
  add column if not exists submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists note text,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.dependents alter column status set default 'pending';

alter table public.providers
  add column if not exists contact_email citext,
  add column if not exists contact_phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text not null default 'Malaysia',
  add column if not exists compliance_status text default 'pending',
  add column if not exists updated_at timestamp with time zone not null default now();

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'providers'
      and column_name = 'contact_email'
  ) then
    null;
  end if;
exception
  when others then null;
end;
$$;

create table if not exists public.provider_users (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete cascade,
  member_code text not null,
  full_name text not null,
  email citext,
  phone text,
  role text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'pending')),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (provider_id, member_code)
);

alter table public.provider_credentials
  add column if not exists provider_user_id uuid references public.provider_users(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists status text default 'submitted',
  add column if not exists submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.claims
  add column if not exists claim_number text unique,
  add column if not exists dependent_id uuid references public.dependents(id) on delete set null,
  add column if not exists provider_id uuid references public.providers(id) on delete set null,
  add column if not exists submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists diagnosis_codes text[] not null default '{}'::text[],
  add column if not exists diagnosis_summary text,
  add column if not exists medication_description text,
  add column if not exists charge_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists selected_charge_items jsonb not null default '{}'::jsonb,
  add column if not exists invoice_number text,
  add column if not exists service_type text,
  add column if not exists rate_card_category text,
  add column if not exists rate_card_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists submitted_at timestamp with time zone,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.claim_documents
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists uploaded_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.provider_claims
  add column if not exists claim_number text unique,
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists member_record_id uuid references public.members(id) on delete set null,
  add column if not exists dependent_id uuid references public.dependents(id) on delete set null,
  add column if not exists provider_user_id uuid references public.provider_users(id) on delete set null,
  add column if not exists submitted_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists diagnosis_codes text[] not null default '{}'::text[],
  add column if not exists diagnosis_summary text,
  add column if not exists medication_description text,
  add column if not exists charge_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists selected_charge_items jsonb not null default '{}'::jsonb,
  add column if not exists service_type text,
  add column if not exists rate_card_category text,
  add column if not exists rate_card_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists submitted_at timestamp with time zone,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists updated_at timestamp with time zone not null default now();

alter table public.provider_claim_documents
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists uploaded_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.admin_audit_logs
  add column if not exists actor_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists entity_type text,
  add column if not exists entity_id text;

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.profiles p on p.id = pr.profile_id
    where pr.profile_id = auth.uid()
      and lower(pr.role_key) = lower(required_role)
      and p.status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profile_roles pr
    join public.profiles p on p.id = pr.profile_id
    where pr.profile_id = auth.uid()
      and pr.portal_key = 'admin'
      and p.status = 'active'
  );
$$;

create or replace function public.current_provider_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pu.provider_id
  from public.provider_users pu
  where pu.profile_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.members m
  where m.profile_id = auth.uid()
  limit 1;
$$;

alter table public.profiles enable row level security;
alter table public.profile_roles enable row level security;
alter table public.admin_users enable row level security;
alter table public.companies enable row level security;
alter table public.members enable row level security;
alter table public.dependents enable row level security;
alter table public.providers enable row level security;
alter table public.provider_users enable row level security;
alter table public.provider_credentials enable row level security;
alter table public.claims enable row level security;
alter table public.claim_documents enable row level security;
alter table public.provider_claims enable row level security;
alter table public.provider_claim_documents enable row level security;
alter table public.admin_audit_logs enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists profile_roles_self_read on public.profile_roles;
create policy profile_roles_self_read on public.profile_roles
for select using (profile_id = auth.uid() or public.is_admin());

drop policy if exists admin_users_admin_only on public.admin_users;
create policy admin_users_admin_only on public.admin_users
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists companies_authenticated_read on public.companies;
create policy companies_authenticated_read on public.companies
for select using (auth.role() = 'authenticated');

drop policy if exists companies_admin_write on public.companies;
create policy companies_admin_write on public.companies
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists members_owner_or_admin_read on public.members;
create policy members_owner_or_admin_read on public.members
for select using (
  profile_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.provider_users pu
    where pu.profile_id = auth.uid()
      and pu.status = 'active'
  )
);

drop policy if exists members_owner_or_admin_update on public.members;
create policy members_owner_or_admin_update on public.members
for update using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists members_admin_insert on public.members;
create policy members_admin_insert on public.members
for insert with check (public.is_admin());

drop policy if exists dependents_owner_or_admin_read on public.dependents;
create policy dependents_owner_or_admin_read on public.dependents
for select using (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists dependents_owner_or_admin_write on public.dependents;
create policy dependents_owner_or_admin_write on public.dependents
for all using (
  public.is_admin()
  or member_id = public.current_member_id()
)
with check (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists providers_authenticated_read on public.providers;
create policy providers_authenticated_read on public.providers
for select using (auth.role() = 'authenticated');

drop policy if exists providers_admin_write on public.providers;
create policy providers_admin_write on public.providers
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_users_visible_to_provider_team on public.provider_users;
create policy provider_users_visible_to_provider_team on public.provider_users
for select using (
  public.is_admin()
  or profile_id = auth.uid()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_users_manage_by_admin on public.provider_users;
create policy provider_users_manage_by_admin on public.provider_users
for all using (public.is_admin())
with check (public.is_admin());

drop policy if exists provider_credentials_visible_to_provider_team on public.provider_credentials;
create policy provider_credentials_visible_to_provider_team on public.provider_credentials
for select using (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_credentials_manage_by_provider_team on public.provider_credentials;
create policy provider_credentials_manage_by_provider_team on public.provider_credentials
for insert with check (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_credentials_update_by_admin_or_provider_team on public.provider_credentials;
create policy provider_credentials_update_by_admin_or_provider_team on public.provider_credentials
for update using (
  public.is_admin()
  or provider_id = public.current_provider_id()
)
with check (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists claims_visible_to_owner_provider_admin on public.claims;
create policy claims_visible_to_owner_provider_admin on public.claims
for select using (
  public.is_admin()
  or member_id = public.current_member_id()
  or provider_id = public.current_provider_id()
);

drop policy if exists claims_insert_by_owner_or_admin on public.claims;
create policy claims_insert_by_owner_or_admin on public.claims
for insert with check (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists claims_update_by_owner_or_admin on public.claims;
create policy claims_update_by_owner_or_admin on public.claims
for update using (
  public.is_admin()
  or member_id = public.current_member_id()
)
with check (
  public.is_admin()
  or member_id = public.current_member_id()
);

drop policy if exists claim_documents_visible_to_owner_provider_admin on public.claim_documents;
create policy claim_documents_visible_to_owner_provider_admin on public.claim_documents
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.claims c
    where c.id = claim_id
      and (
        c.member_id = public.current_member_id()
        or c.provider_id = public.current_provider_id()
      )
  )
);

drop policy if exists claim_documents_insert_by_owner_or_admin on public.claim_documents;
create policy claim_documents_insert_by_owner_or_admin on public.claim_documents
for insert with check (
  public.is_admin()
  or exists (
    select 1
    from public.claims c
    where c.id = claim_id
      and c.member_id = public.current_member_id()
  )
);

drop policy if exists provider_claims_visible_to_provider_or_admin on public.provider_claims;
create policy provider_claims_visible_to_provider_or_admin on public.provider_claims
for select using (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_claims_insert_by_provider_or_admin on public.provider_claims;
create policy provider_claims_insert_by_provider_or_admin on public.provider_claims
for insert with check (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_claims_update_by_provider_or_admin on public.provider_claims;
create policy provider_claims_update_by_provider_or_admin on public.provider_claims
for update using (
  public.is_admin()
  or provider_id = public.current_provider_id()
)
with check (
  public.is_admin()
  or provider_id = public.current_provider_id()
);

drop policy if exists provider_claim_documents_visible_to_provider_or_admin on public.provider_claim_documents;
create policy provider_claim_documents_visible_to_provider_or_admin on public.provider_claim_documents
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    where pc.id = provider_claim_id
      and pc.provider_id = public.current_provider_id()
  )
);

drop policy if exists provider_claim_documents_insert_by_provider_or_admin on public.provider_claim_documents;
create policy provider_claim_documents_insert_by_provider_or_admin on public.provider_claim_documents
for insert with check (
  public.is_admin()
  or exists (
    select 1
    from public.provider_claims pc
    where pc.id = provider_claim_id
      and pc.provider_id = public.current_provider_id()
  )
);

drop policy if exists admin_audit_logs_admin_only on public.admin_audit_logs;
create policy admin_audit_logs_admin_only on public.admin_audit_logs
for all using (public.is_admin())
with check (public.is_admin());

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_admin_users_updated_at on public.admin_users;
create trigger trg_admin_users_updated_at before update on public.admin_users
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at before update on public.companies
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_members_updated_at on public.members;
create trigger trg_members_updated_at before update on public.members
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_dependents_updated_at on public.dependents;
create trigger trg_dependents_updated_at before update on public.dependents
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_providers_updated_at on public.providers;
create trigger trg_providers_updated_at before update on public.providers
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_provider_users_updated_at on public.provider_users;
create trigger trg_provider_users_updated_at before update on public.provider_users
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_provider_credentials_updated_at on public.provider_credentials;
create trigger trg_provider_credentials_updated_at before update on public.provider_credentials
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_claims_updated_at on public.claims;
create trigger trg_claims_updated_at before update on public.claims
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_provider_claims_updated_at on public.provider_claims;
create trigger trg_provider_claims_updated_at before update on public.provider_claims
for each row execute procedure public.set_updated_at();
