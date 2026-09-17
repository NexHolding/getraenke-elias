-- Optional read/export-only finance access. Existing employee permissions stay unchanged.
alter table public.staff add column if not exists finance_readonly boolean not null default false;
comment on column public.staff.finance_readonly is 'Restricts a non-owner to read/export finance; API mutations are denied.';
