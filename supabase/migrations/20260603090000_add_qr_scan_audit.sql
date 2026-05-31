create table if not exists public.qr_scan_audit (
  id uuid primary key default gen_random_uuid(),
  scanned_at timestamptz not null default now(),
  provider_profile_id uuid null,
  member_profile_id uuid null,
  token_jti text null,
  result text not null,
  ip text null,
  user_agent text null
);
