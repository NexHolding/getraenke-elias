-- Capture additional invoice facts at issue time. No existing invoice is rewritten.
alter table invoices add column service_date date, add column delivery_number bigint;
create function invoice_document_metadata() returns trigger
language plpgsql security definer set search_path=public as $$
declare cfg jsonb; delivered deliveries;
begin
  select value into cfg from settings where id=1;
  select * into delivered from deliveries where id=NEW.delivery_id;
  NEW.service_date := (delivered.delivered_at at time zone 'Europe/Berlin')::date;
  NEW.delivery_number := delivered.number;
  NEW.business_snapshot := NEW.business_snapshot || jsonb_build_object(
    'bank_account_holder',cfg->>'bank_account_holder','bank_iban',cfg->>'bank_iban',
    'bank_bic',cfg->>'bank_bic','bank_name',cfg->>'bank_name');
  return NEW;
end; $$;
-- Alphabetical execution after invoices_snapshot, before the immutable row is stored.
create trigger invoices_z_document_metadata before insert on invoices
for each row execute function invoice_document_metadata();
revoke all on function invoice_document_metadata() from public,anon,authenticated;

-- Preserve package size at order creation; later catalogue edits must not change documents.
create function order_document_package_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  select coalesce(jsonb_agg(case when p.id is null then item else item || jsonb_build_object(
    'pack_count',p.pack_count,'volume_ml',p.volume_ml) end order by ord),'[]'::jsonb)
  into NEW.items from jsonb_array_elements(NEW.items) with ordinality as l(item,ord)
  left join products p on p.id=item->>'id';
  return NEW;
end; $$;
create trigger orders_document_package_snapshot before insert on orders
for each row execute function order_document_package_snapshot();
revoke all on function order_document_package_snapshot() from public,anon,authenticated;
