create extension if not exists pgcrypto;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  admin_id text unique not null,
  full_name text not null,
  role text not null,
  status text default 'active',
  created_at timestamp with time zone default now()
);

create table if not exists admin_accounts (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(id) on delete cascade,
  password_hash text not null,
  created_at timestamp with time zone default now(),
  unique (admin_user_id)
);

create table if not exists admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(id) on delete set null,
  action text not null,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  company_id text unique not null,
  name text not null,
  status text default 'active',
  created_at timestamp with time zone default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  staff_id text not null,
  full_name text not null,
  email text not null,
  phone text,
  nationality text default 'malaysian',
  nric_passport text,
  passport_expiry date,
  status text default 'active',
  created_at timestamp with time zone default now(),
  unique (company_id, staff_id)
);

create table if not exists member_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  password_hash text not null,
  activated_at timestamp with time zone default now(),
  unique (member_id)
);

create table if not exists dependents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  gender text,
  nric_passport text,
  dob date,
  passport_required boolean default false,
  status text default 'active',
  created_at timestamp with time zone default now()
);

create table if not exists entitlement_categories (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  default_limit numeric(12,2) default 0,
  is_active boolean default true
);

create table if not exists member_entitlements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  category_id uuid references entitlement_categories(id) on delete cascade,
  limit_amount numeric(12,2) default 0,
  used_amount numeric(12,2) default 0,
  unique (member_id, category_id)
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  category_code text not null,
  visit_date date not null,
  provider_name text,
  diagnosis text,
  amount numeric(12,2) not null,
  status text default 'submitted',
  referral_date date,
  created_at timestamp with time zone default now()
);

create table if not exists claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references claims(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  created_at timestamp with time zone default now()
);

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  vendor_id text unique not null,
  provider_name text not null,
  email text,
  phone text,
  status text default 'active',
  created_at timestamp with time zone default now()
);

create table if not exists provider_accounts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete cascade,
  password_hash text not null,
  activated_at timestamp with time zone default now(),
  unique (provider_id)
);

create table if not exists provider_credentials (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  expiry_date date,
  created_at timestamp with time zone default now()
);

create table if not exists provider_claims (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete cascade,
  member_id uuid,
  treatment_date date not null,
  invoice_number text,
  diagnosis_code text,
  total_amount numeric(12,2) not null,
  status text default 'submitted',
  created_at timestamp with time zone default now()
);

create table if not exists provider_claim_documents (
  id uuid primary key default gen_random_uuid(),
  provider_claim_id uuid references provider_claims(id) on delete cascade,
  doc_type text not null,
  storage_path text not null,
  created_at timestamp with time zone default now()
);
