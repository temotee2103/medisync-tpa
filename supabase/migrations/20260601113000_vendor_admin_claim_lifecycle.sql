alter table public.provider_claims
  add column if not exists review_note text,
  add column if not exists reviewed_by_profile_id uuid references public.profiles(id),
  add column if not exists approval_attachment_path text,
  add column if not exists approval_attachment_name text,
  add column if not exists approved_at timestamptz;

update public.provider_claims
set approved_at = coalesce(approved_at, now())
where status = 'approved'
  and approved_at is null;
