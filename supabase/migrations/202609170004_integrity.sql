alter table public.products add column revision integer not null default 0;
create or replace function public.bump_revision() returns trigger language plpgsql as $$begin NEW.revision:=OLD.revision+1;return NEW;end;$$;
create trigger products_revision before update on public.products for each row execute function public.bump_revision();
create or replace function public.save_product(p_value jsonb,p_expected_revision integer,p_actor uuid) returns boolean language plpgsql security definer set search_path=public as $$declare p products;old_stock integer;old_revision integer;begin
 perform pg_advisory_xact_lock(17092026);
 select * into p from jsonb_populate_record(null::products,p_value);
 select stock,revision into old_stock,old_revision from products where id=p.id for update;
 if found then
  if p_expected_revision is null or old_revision<>p_expected_revision then return false;end if;
  update products set sku=p.sku,name=p.name,category=p.category,pack_count=p.pack_count,volume_ml=p.volume_ml,price_cents=p.price_cents,source_unit_price_cents=p.source_unit_price_cents,deposit_cents=p.deposit_cents,tax_rate=p.tax_rate,deposit_tax_rate=p.deposit_tax_rate,stock=p.stock,min_stock=p.min_stock,target_stock=p.target_stock,supplier_id=p.supplier_id,reorder_enabled=p.reorder_enabled,active=p.active,verified=p.verified,barcode=p.barcode,source=p.source,kind=p.kind where id=p.id;
 else
  p.revision:=0;insert into products select p.*;
 end if;
 if p.stock is distinct from old_stock and p.stock is not null then insert into stock_movements(product_id,delta,reason,actor) values(p.id,p.stock-coalesce(old_stock,0),case when old_stock is null then 'Erstbestand' else 'Inventurkorrektur' end,p_actor);end if;
 return true;end;$$;
revoke all on function public.save_product(jsonb,integer,uuid) from public,anon,authenticated;grant execute on function public.save_product(jsonb,integer,uuid) to service_role;
alter table public.orders add column request_id uuid unique;
alter table public.mail_outbox add column claimed_at timestamptz;
create or replace function public.claim_mail() returns setof public.mail_outbox language plpgsql security definer set search_path=public as $$begin
 update mail_outbox set status='uncertain',error='Worker unterbrochen; Zustellung vor erneutem Versand prüfen.' where status='sending' and claimed_at<now()-interval '15 minutes';
 return query update mail_outbox set status='sending',claimed_at=now() where id in(select id from mail_outbox where status='pending' order by created_at limit 5 for update skip locked) returning *;end;$$;
