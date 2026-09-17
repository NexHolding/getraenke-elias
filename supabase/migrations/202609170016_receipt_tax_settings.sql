-- Current DE defaults, not a retroactive tax change. Existing product rates and receipts stay untouched.
update public.settings set value = '{"default_tax_rate":19,"default_deposit_tax_rate":19,"vat_id":"","register_id":"ELIAS-KASSE-01"}'::jsonb || value where id=1;

-- New receipts preserve issuer details at booking time, independently of future settings.
alter table public.sales add column issuer_snapshot jsonb;
alter table public.sales add column fiscal jsonb;
create function public.capture_receipt_issuer() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb;
begin
  select value into cfg from public.settings where id=1;
  new.issuer_snapshot := jsonb_build_object(
    'business_name',coalesce(nullif(cfg->>'business_name',''),'Getränkeshop Elias · Frank Elias'),
    'business_address',coalesce(nullif(cfg->>'business_address',''),'Wartbergstraße 3 · 74076 Heilbronn'),
    'tax_number',coalesce(cfg->>'tax_number',''),
    'vat_id',coalesce(cfg->>'vat_id',''),
    'register_id',coalesce(nullif(cfg->>'register_id',''),'ELIAS-KASSE-01'),
    'website',coalesce(cfg->>'domain','getraenke-elias.de')
  );
  -- Setup sales cannot carry invented fiscal signatures. A future fiscal adapter needs a separate reviewed write path.
  if new.test_mode then new.fiscal := null; end if;
  return new;
end;
$$;
revoke all on function public.capture_receipt_issuer() from public,anon,authenticated;
create trigger receipt_issuer_before_insert before insert on public.sales
for each row execute function public.capture_receipt_issuer();

-- Also use the configured defaults when inventory adds a product without explicit tax fields.
create function public.default_product_tax(p_deposit boolean) returns integer
language sql stable security definer set search_path=public as $$
  select case when (select value->>case when p_deposit then 'default_deposit_tax_rate' else 'default_tax_rate' end from settings where id=1)='7' then 7 else 19 end
$$;
revoke all on function public.default_product_tax(boolean) from public,anon,authenticated;
grant execute on function public.default_product_tax(boolean) to service_role;
alter table public.products alter column tax_rate set default public.default_product_tax(false);
alter table public.products alter column deposit_tax_rate set default public.default_product_tax(true);

-- Content is fixed once issued. The separately authorized setup-reset DELETE path stays available.
create function public.protect_receipt_content() returns trigger language plpgsql as $$
begin raise exception 'Receipt content is immutable'; end;
$$;
revoke all on function public.protect_receipt_content() from public,anon,authenticated;
create trigger receipt_content_immutable before update on public.sales
for each row execute function public.protect_receipt_content();
