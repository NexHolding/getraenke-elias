-- Operational model. All access passes server authorization; no anonymous table policies.
alter table products add column group_name text not null default '', add column variant text not null default '', add column image_url text not null default '', add column image_source text not null default '', add column deposit_profile text not null default 'custom', add column data_note text not null default '';
alter table suppliers add column number bigint generated always as identity unique, add column company text not null default '', add column address text not null default '', add column contact text not null default '', add column notes text not null default '';
update suppliers set is_demo=false;
alter table staff add column number bigint generated always as identity unique, add column email text not null default '', add column phone text not null default '', add column address text not null default '', add column notes text not null default '', add column permissions jsonb not null default '["uebersicht","kasse"]', add column active boolean not null default true, add column pin_hash text;
update staff s set email=u.email from auth.users u where u.id=s.user_id;
-- PIN hashes are never selectable with the public authenticated client.
revoke select on staff from authenticated; grant select(user_id,role,name,number,email,phone,address,notes,permissions,active) on staff to authenticated;
create table customers(id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,user_id uuid unique references auth.users(id) on delete set null,name text not null,email text not null,phone text not null default '',address text not null default '',notes text not null default '',invoice_email boolean not null default true,dropoff_allowed boolean not null default false,dropoff_note text not null default '',windows jsonb not null default '[]',latitude double precision,longitude double precision,created_at timestamptz not null default now());
create unique index customers_email_unique on customers(lower(email));
alter table customers enable row level security;
create table subscriptions(id uuid primary key default gen_random_uuid(),customer_id uuid not null references customers(id),items jsonb not null,interval text not null check(interval in('weekly','biweekly','monthly','quarterly','halfyearly','yearly')),next_date date not null,active boolean not null default true,created_at timestamptz not null default now());
alter table subscriptions enable row level security;
alter table orders add column customer_id uuid references customers(id),add column delivered jsonb not null default '{}',add column delivery_date date,add column eta_start text,add column eta_end text,add column route_position integer,add column preference_snapshot jsonb not null default '{}',add column subscription_id uuid references subscriptions(id),add column recurrence_date date;
create unique index subscription_order_once on orders(subscription_id,recurrence_date) where subscription_id is not null;
alter table orders drop constraint orders_status_check; alter table orders add constraint orders_status_check check(status in('new','confirmed','delivering','partial','completed','cancelled'));
create table deliveries(id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,order_id uuid not null references orders(id),customer_id uuid references customers(id),items jsonb not null default '[]',status text not null default 'draft' check(status in('draft','delivered')),signature text,signed_name text not null default '',delivered_at timestamptz,created_at timestamptz not null default now(),revision integer not null default 0,actor uuid references auth.users(id),mode text not null default 'setup');
create unique index one_open_delivery on deliveries(order_id) where status='draft';
alter table deliveries enable row level security;
create table invoices(id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,order_id uuid not null references orders(id),delivery_id uuid not null unique references deliveries(id),customer_id uuid references customers(id),customer_snapshot jsonb not null,items jsonb not null,total_cents integer not null,net_cents integer not null,tax_cents integer not null,deposit_cents integer not null,status text not null default 'open' check(status in('open','paid','cancelled')),mode text not null default 'setup',created_at timestamptz not null default now());
alter table invoices enable row level security;
create table terminal_devices(id uuid primary key default gen_random_uuid(),token_hash text not null unique,name text not null,active boolean not null default true,expires_at timestamptz not null,created_at timestamptz not null default now());
create table terminal_sessions(token_hash text primary key,device_id uuid not null references terminal_devices(id),user_id uuid not null references staff(user_id),expires_at timestamptz not null);
alter table terminal_devices enable row level security; alter table terminal_sessions enable row level security;
create table automation_runs(kind text not null,slot text not null,created_at timestamptz not null default now(),primary key(kind,slot)); alter table automation_runs enable row level security;
alter table sales add column discount_percent integer not null default 0 check(discount_percent between 0 and 100),add column actor_name text not null default '',add column mode text not null default 'setup';
update settings set value=value||'{"live_mode":false,"guest_orders":true,"reorder_days":[1],"reorder_time":"10:00","reorder_weeks":1,"reorder_anchor":"2026-09-14","delivery_days":[1,2,3,4,5],"delivery_from":"10:00","delivery_to":"18:00","delivery_stop_minutes":10,"discount_percent":10,"business_name":"Getränkeshop Elias · Frank Elias","business_address":"Wartbergstraße 3 · 74076 Heilbronn","tax_number":"","route_geocoding":false}' where id=1;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create trigger deliveries_audit after insert or update on deliveries for each row execute function audit_change();
create trigger customers_audit after insert or update on customers for each row execute function audit_change();
-- Disable immediate mail trigger: the scheduled, locked batch owns purchase generation.
create or replace function queue_purchase_mail() returns trigger language plpgsql security definer set search_path=public as $$declare s suppliers;cfg jsonb;b text;begin
 select * into s from suppliers where id=NEW.supplier_id;select value into cfg from settings where id=1;
 if not s.auto_send or s.email='' then return NEW;end if;
 select string_agg((i->>'quantity')||' x '||(i->>'name'),E'\n') into b from jsonb_array_elements(NEW.items) i;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('purchase',NEW.id,s.email,'Getränke Elias – Sammelbestellung '||left(NEW.id::text,8),'Bitte liefern Sie an Getränkeshop Elias, Wartbergstraße 3, 74076 Heilbronn:'||E'\n\n'||b||E'\n\nBitte bestätigen Sie Bestellung und Liefertermin.') on conflict do nothing;
 update purchases set status='queued' where id=NEW.id;return NEW;end;$$;
create or replace function generate_reorders() returns integer language plpgsql security definer set search_path=public as $$declare p record;s record;pending integer;q integer;rows jsonb;n integer:=0;cfg jsonb;local_now timestamp;slot_key text;begin
 perform pg_advisory_xact_lock(17092026);
 select value into cfg from settings where id=1;
 if not coalesce((cfg->>'auto_reorder')::boolean,false) then return 0;end if;
 local_now:=now() at time zone 'Europe/Berlin';
 if not (cfg->'reorder_days' @> to_jsonb(array[extract(isodow from local_now)::integer])) or local_now::time<(cfg->>'reorder_time')::time then return 0;end if;
 if mod(floor((local_now::date-(cfg->>'reorder_anchor')::date)/7.0)::integer,greatest(1,(cfg->>'reorder_weeks')::integer))<>0 then return 0;end if;
 slot_key:=to_char(local_now,'YYYY-MM-DD');
 insert into automation_runs(kind,slot) values('reorder',slot_key) on conflict do nothing;if not found then return 0;end if;
 for s in select * from suppliers loop rows:='[]';
 for p in select * from products where supplier_id=s.id and active and reorder_enabled and stock is not null and stock<min_stock order by id for update loop
 select coalesce(sum((i->>'quantity')::integer),0) into pending from purchases o cross join lateral jsonb_array_elements(o.items) i where o.status in('draft','queued','sent') and i->>'id'=p.id;
 q:=greatest(0,p.target_stock-p.stock-pending);if q>0 then rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q));end if;
 end loop;if jsonb_array_length(rows)>0 then insert into purchases(supplier_id,items) values(s.id,rows);n:=n+1;end if;end loop;return n;end;$$;
-- Extend optimistic article save atomically.
create or replace function save_product(p_value jsonb,p_expected_revision integer,p_actor uuid) returns boolean language plpgsql security definer set search_path=public as $$declare p products;old_stock integer;old_revision integer;begin
 perform pg_advisory_xact_lock(17092026);select * into p from jsonb_populate_record(null::products,p_value);
 select stock,revision into old_stock,old_revision from products where id=p.id for update;
 if found then if p_expected_revision is null or old_revision<>p_expected_revision then return false;end if;
 update products set sku=p.sku,name=p.name,category=p.category,pack_count=p.pack_count,volume_ml=p.volume_ml,price_cents=p.price_cents,source_unit_price_cents=p.source_unit_price_cents,deposit_cents=p.deposit_cents,tax_rate=p.tax_rate,deposit_tax_rate=p.deposit_tax_rate,stock=p.stock,min_stock=p.min_stock,target_stock=p.target_stock,supplier_id=p.supplier_id,reorder_enabled=p.reorder_enabled,active=p.active,verified=p.verified,barcode=p.barcode,source=p.source,kind=p.kind,group_name=p.group_name,variant=p.variant,image_url=p.image_url,image_source=p.image_source,deposit_profile=p.deposit_profile,data_note=p.data_note where id=p.id;
 else p.revision:=0;insert into products select p.*;end if;
 if p.stock is distinct from old_stock and p.stock is not null then insert into stock_movements(product_id,delta,reason,actor) values(p.id,p.stock-coalesce(old_stock,0),'Inventur',p_actor);end if;return true;end;$$;
