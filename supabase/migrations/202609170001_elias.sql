create table if not exists public.staff(user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('owner','staff')), name text not null default 'Team Elias');
create table if not exists public.suppliers(id text primary key, name text not null, email text not null default '',phone text not null default '',is_demo boolean not null default false,auto_send boolean not null default false);
create table if not exists public.products(id text primary key,sku text not null unique,name text not null,category text not null,pack_count integer not null check(pack_count>0),volume_ml integer not null check(volume_ml>=0),price_cents integer not null check(price_cents>=0),source_unit_price_cents integer,deposit_cents integer check(deposit_cents>=0),tax_rate integer not null default 19 check(tax_rate in(0,7,19)),deposit_tax_rate integer not null default 19 check(deposit_tax_rate in(0,7,19)),stock integer check(stock>=0),min_stock integer not null default 0 check(min_stock>=0),target_stock integer not null default 0 check(target_stock>=min_stock),supplier_id text references public.suppliers(id),reorder_enabled boolean not null default false,active boolean not null default true,verified boolean not null default false,barcode text not null default '',source text not null default '',kind text not null default 'beverage' check(kind in ('beverage','rental')));
create table if not exists public.settings(id integer primary key check(id=1),value jsonb not null default '{}',smtp_secret text);
create table if not exists public.orders(id uuid primary key default gen_random_uuid(),number bigint generated always as identity,customer_name text not null,email text not null,phone text not null,address text not null,notes text not null default '',items jsonb not null,status text not null default 'new' check(status in('new','confirmed','delivering','completed','cancelled')),created_at timestamptz not null default now());
create table if not exists public.sales(id uuid primary key,number bigint generated always as identity,created_at timestamptz not null default now(),items jsonb not null,total_cents integer not null,net_cents integer not null,tax_cents integer not null,deposit_cents integer not null,payment text not null check(payment in('cash','card')),test_mode boolean not null default true check(test_mode),actor uuid references auth.users(id));
create table if not exists public.stock_movements(id uuid primary key default gen_random_uuid(),product_id text not null references public.products(id),delta integer not null,reason text not null,created_at timestamptz not null default now(),actor uuid);
create table if not exists public.purchases(id uuid primary key default gen_random_uuid(),supplier_id text not null references public.suppliers(id),status text not null default 'draft' check(status in('draft','sent','received','cancelled')),items jsonb not null,created_at timestamptz not null default now(),received_at timestamptz);
create table if not exists public.closings(id uuid primary key default gen_random_uuid(),kind text not null check(kind in('day','month')),period text not null,totals jsonb not null,created_at timestamptz not null default now(),actor uuid,test_mode boolean not null default true check(test_mode),unique(kind,period,test_mode));
create table if not exists public.audit_log(id bigint generated always as identity primary key,table_name text not null,record_id text,action text not null,actor uuid,created_at timestamptz not null default now(),details jsonb);
create table if not exists public.request_limits(key text primary key,window_start timestamptz not null default now(),count integer not null default 1);
alter table public.staff enable row level security;
create policy staff_self on public.staff for select to authenticated using(user_id=auth.uid());
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.settings enable row level security;
alter table public.orders enable row level security;
alter table public.sales enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchases enable row level security;
alter table public.closings enable row level security;
alter table public.audit_log enable row level security;
alter table public.request_limits enable row level security;
-- No public write policies. Every mutation is validated and staff-authorized by the server.
create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path=public as $$ begin
 insert into audit_log(table_name,record_id,action,actor,details) values(TG_TABLE_NAME,coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id'),TG_OP,auth.uid(),case when TG_TABLE_NAME='settings' then '{"changed":true}'::jsonb else jsonb_build_object('before',to_jsonb(OLD),'after',to_jsonb(NEW)) end);return coalesce(NEW,OLD);end;$$;
create trigger products_audit after insert or update or delete on public.products for each row execute function public.audit_change();
create trigger suppliers_audit after insert or update or delete on public.suppliers for each row execute function public.audit_change();
create trigger settings_audit after update on public.settings for each row execute function public.audit_change();
create trigger orders_audit after update on public.orders for each row execute function public.audit_change();
create or replace function public.immutable_record() returns trigger language plpgsql as $$begin raise exception 'Journal records are immutable';end;$$;
create trigger sales_immutable before update or delete on public.sales for each row execute function public.immutable_record();
create trigger closings_immutable before update or delete on public.closings for each row execute function public.immutable_record();
create trigger audit_immutable before update or delete on public.audit_log for each row execute function public.immutable_record();
create or replace function public.check_request_limit(p_key text) returns boolean language plpgsql security definer set search_path=public as $$declare n integer;begin
 insert into request_limits(key) values(p_key) on conflict(key) do update set count=case when request_limits.window_start<now()-interval '1 hour' then 1 else request_limits.count+1 end,window_start=case when request_limits.window_start<now()-interval '1 hour' then now() else request_limits.window_start end returning count into n;return n<=8;end;$$;
create or replace function public.generate_reorders() returns integer language plpgsql security definer set search_path=public as $$declare p record;s record;pending integer;q integer;rows jsonb;n integer:=0;begin
 perform pg_advisory_xact_lock(17092026);
 if not coalesce((select (value->>'auto_reorder')::boolean from settings where id=1),false) then return 0;end if;
 for s in select * from suppliers loop rows:='[]'::jsonb;
  for p in select * from products where supplier_id=s.id and active and reorder_enabled and stock is not null and stock<min_stock order by id for update loop
   select coalesce(sum((i->>'quantity')::integer),0) into pending from purchases o cross join lateral jsonb_array_elements(o.items) i where o.status in('draft','sent') and i->>'id'=p.id;
   q:=greatest(0,p.target_stock-p.stock-pending);
   if q>0 then rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q));end if;
  end loop;
  if jsonb_array_length(rows)>0 then insert into purchases(supplier_id,items) values(s.id,rows);n:=n+1;end if;
 end loop;return n;end;$$;
create or replace function public.receive_purchase(p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$declare p purchases;i jsonb;begin
 select * into p from purchases where id=p_id for update;if not found then raise exception 'Not found';end if;
 if p.status='received' then return;end if;if p.status='cancelled' then raise exception 'Cancelled';end if;
 for i in select value from jsonb_array_elements(p.items) order by value->>'id' loop
  if (select stock from products where id=i->>'id') is null then raise exception 'Initial inventory required';end if;
  update products set stock=stock+(i->>'quantity')::integer where id=i->>'id';
  insert into stock_movements(product_id,delta,reason,actor) values(i->>'id',(i->>'quantity')::integer,'Wareneingang '||p_id,p_actor);
 end loop;update purchases set status='received',received_at=now() where id=p_id;end;$$;
create or replace function public.save_test_sale(p_id uuid,p_lines jsonb,p_payment text,p_actor uuid,p_returns jsonb default '[]') returns jsonb language plpgsql security definer set search_path=public as $$declare l jsonb;p products;items jsonb:='[]';q integer;g integer:=0;n integer:=0;d integer:=0;a integer;b integer;netline integer;s sales;today text;begin
 perform pg_advisory_xact_lock(17092027);
 select * into s from sales where id=p_id;if found then return to_jsonb(s);end if;
 today:=to_char(now() at time zone 'Europe/Berlin','YYYY-MM-DD');
 if exists(select 1 from closings where (kind='day' and period=today) or(kind='month' and period=left(today,7))) then raise exception 'Period closed';end if;
 for l in select value from jsonb_array_elements(p_lines) loop
  select * into p from products where id=l->>'id' and active;
  if not found or p.deposit_cents is null or not p.verified then raise exception 'Article not verified';end if;
  q:=(l->>'quantity')::integer;if q<1 or q>1000 then raise exception 'Quantity invalid';end if;
  a:=q*p.price_cents;b:=q*p.deposit_cents;netline:=round(a*100.0/(100+p.tax_rate))+round(b*100.0/(100+p.deposit_tax_rate));g:=g+a+b;n:=n+netline;d:=d+b;
  items:=items||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q,'price_cents',p.price_cents,'deposit_cents',p.deposit_cents,'tax_rate',p.tax_rate,'deposit_tax_rate',p.deposit_tax_rate));
 end loop;
 for l in select value from jsonb_array_elements(p_returns) loop
  q:=(l->>'quantity')::integer;b:=(l->>'deposit_cents')::integer;if q<1 or q>1000 or b not in(8,15,25,150) then raise exception 'Return invalid';end if;
  d:=d-q*b;g:=g-q*b;n:=n-round(q*b*100.0/119);items:=items||jsonb_build_array(jsonb_build_object('id','return-'||b,'name','Pfandrücknahme','quantity',-q,'price_cents',0,'deposit_cents',b,'tax_rate',19,'deposit_tax_rate',19));
 end loop;
 if jsonb_array_length(items)=0 then raise exception 'Empty sale';end if;
 insert into sales(id,items,total_cents,net_cents,tax_cents,deposit_cents,payment,actor) values(p_id,items,g,n,g-n,d,p_payment,p_actor) returning * into s;
 -- Test receipts never change real inventory or create real fiscal records.
 return to_jsonb(s);end;$$;
create or replace function public.close_test_period(p_kind text,p_period text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare result closings;summary jsonb;begin
 perform pg_advisory_xact_lock(17092027);
 if p_kind not in('day','month') or (p_kind='day' and p_period!~'^\d{4}-\d{2}-\d{2}$') or (p_kind='month' and p_period!~'^\d{4}-\d{2}$') then raise exception 'Invalid period';end if;
 if p_period>to_char(now() at time zone 'Europe/Berlin',case when p_kind='day' then 'YYYY-MM-DD' else 'YYYY-MM' end) then raise exception 'Future period';end if;
 select * into result from closings where kind=p_kind and period=p_period;if found then return to_jsonb(result);end if;
 select jsonb_build_object('count',count(*),'gross',coalesce(sum(total_cents),0),'net',coalesce(sum(net_cents),0),'tax',coalesce(sum(tax_cents),0),'deposit',coalesce(sum(deposit_cents),0),'cash',coalesce(sum(total_cents)filter(where payment='cash'),0),'card',coalesce(sum(total_cents)filter(where payment='card'),0)) into summary from sales where to_char(created_at at time zone 'Europe/Berlin',case when p_kind='day' then 'YYYY-MM-DD' else 'YYYY-MM' end)=p_period;
 insert into closings(kind,period,totals,actor) values(p_kind,p_period,summary,p_actor) returning * into result;return to_jsonb(result);end;$$;
revoke all on function public.check_request_limit(text),public.generate_reorders(),public.receive_purchase(uuid,uuid),public.save_test_sale(uuid,jsonb,text,uuid,jsonb),public.close_test_period(text,text,uuid) from public,anon,authenticated;
grant execute on function public.check_request_limit(text),public.generate_reorders(),public.receive_purchase(uuid,uuid),public.save_test_sale(uuid,jsonb,text,uuid,jsonb),public.close_test_period(text,text,uuid) to service_role;
insert into suppliers(id,name,is_demo) values('demo-supplier','Demo-Lieferant',true) on conflict do nothing;
insert into settings(id,value) values(1,'{"auto_reorder":false,"instagram":"","domain":"getraenke-elias.de","printer_mode":"browser","printer_address":"","tse_provider":"","smtp_host":"","smtp_port":465,"smtp_user":"","smtp_from":""}') on conflict do nothing;
