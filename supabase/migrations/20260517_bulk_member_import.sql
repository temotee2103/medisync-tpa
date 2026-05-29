alter table public.dependents
  add column if not exists import_key text;

create unique index if not exists idx_dependents_import_key
  on public.dependents(member_id, import_key)
  where import_key is not null;
