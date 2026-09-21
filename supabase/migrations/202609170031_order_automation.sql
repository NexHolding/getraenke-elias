-- Existing orders retain their handling; all subsequent orders enter the monitored inbox.
alter table orders add column auto_processing boolean not null default false,
 add column stock_check jsonb not null default '[]',add column stock_checked_at timestamptz,
 add column order_updated_at timestamptz not null default now(),
 add column auto_confirmed_at timestamptz,add column delivery_started_at timestamptz,
 add column delivery_started_by uuid references auth.users(id);
alter table orders alter column auto_processing set default true;
create function stamp_order_update() returns trigger language plpgsql set search_path=public as $$begin NEW.order_updated_at:=clock_timestamp();return NEW;end;$$;
revoke all on function stamp_order_update() from public,anon,authenticated;
create trigger stamp_order_update before update on orders for each row execute function stamp_order_update();
create index orders_update_version on orders(order_updated_at desc);
create table order_inbox_events(order_id uuid primary key references orders(id) on delete cascade,created_at timestamptz not null default now());
create table order_inbox_seen(order_id uuid references order_inbox_events(order_id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,seen_at timestamptz not null default now(),primary key(order_id,user_id));
alter table order_inbox_events enable row level security;
alter table order_inbox_seen enable row level security;
revoke all on order_inbox_events,order_inbox_seen from public,anon,authenticated;
grant all on order_inbox_events,order_inbox_seen to service_role;
create index order_inbox_events_time on order_inbox_events(created_at,order_id);
create index order_automation_pending on orders(created_at,id) where auto_processing and status='new';

-- Physical stock minus outstanding commitments. NULL stock is unknown, never "infinite".
create function order_stock_check(p_items jsonb,p_delivered jsonb default '{}',p_exclude uuid default null) returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare l jsonb;p products;q integer;r bigint;available bigint;result jsonb:='[]';begin
 for l in select value from jsonb_array_elements(p_items) loop
  q:=greatest(0,(l->>'quantity')::integer-coalesce((p_delivered->>(l->>'id'))::integer,0));
  if q=0 then continue;end if;
  select * into p from products where id=l->>'id';
  select coalesce(sum(greatest(0,(i->>'quantity')::integer-coalesce((o.delivered->>(i->>'id'))::integer,0))),0) into r
   from orders o cross join lateral jsonb_array_elements(o.items)i
   where o.id is distinct from p_exclude and o.status in('confirmed','partial','delivering') and i->>'id'=l->>'id';
  available:=case when p.stock is null then null else greatest(0,p.stock-r) end;
  result:=result||jsonb_build_array(jsonb_build_object('id',l->>'id','name',l->>'name','required',q,'stock',p.stock,'reserved',r,'available',available,'missing',case when available is null then null else greatest(0,q-available) end,'state',case when p.id is null or not p.active then 'inactive' when p.stock is null then 'unknown' when available<q then 'shortage' else 'available' end));
 end loop;return result;
end;$$;
revoke all on function order_stock_check(jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function order_stock_check(jsonb,jsonb,uuid) to service_role;

create or replace function order_payment_defaults() returns trigger language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock(17092027);
 if NEW.status<>'new' then
  NEW.approved_payment_method:=coalesce(NEW.approved_payment_method,(select payment_method from customers where id=NEW.customer_id),'cash');
 elsif NEW.auto_processing then
  -- Customer subscriptions have already been ownership-checked when created.
  if NEW.subscription_id is not null and exists(select 1 from subscriptions where id=NEW.subscription_id and customer_id=NEW.customer_id) then
   NEW.requested_payment_method:=coalesce(NEW.requested_payment_method,(select payment_method from customers where id=NEW.customer_id),'cash');
   NEW.approved_payment_method:=coalesce(NEW.approved_payment_method,(select payment_method from customers where id=NEW.customer_id),'cash');
  elsif NEW.requested_payment_method in('cash','card') then NEW.approved_payment_method:=coalesce(NEW.approved_payment_method,NEW.requested_payment_method);
  end if;
 end if;
 if NEW.auto_processing then
  NEW.stock_check:=order_stock_check(NEW.items,NEW.delivered,NEW.id);NEW.stock_checked_at:=now();
  if NEW.status='new' and jsonb_array_length(NEW.stock_check)>0 and not exists(select 1 from jsonb_array_elements(NEW.stock_check)x where x->>'state'<>'available') then
   NEW.status:='confirmed';NEW.auto_confirmed_at:=now();
  end if;
 end if;
 return NEW;
end;$$;

create function notify_new_order() returns trigger language plpgsql security definer set search_path=public as $$begin
 if NEW.auto_processing then
  insert into order_inbox_events(order_id) values(NEW.id) on conflict do nothing;
  if NEW.auto_confirmed_at is not null then insert into audit_log(table_name,record_id,action,actor,details) values('orders',NEW.id::text,'automatically_confirmed',null,jsonb_build_object('stock_check',NEW.stock_check,'payment_pending',NEW.approved_payment_method is null));end if;
 end if;return NEW;
end;$$;
revoke all on function notify_new_order() from public,anon,authenticated;
create trigger notify_new_order after insert on orders for each row execute function notify_new_order();

-- Recheck waiting inquiries after replenishment/cancellation; FIFO under the same stock lock as POS/delivery.
create function process_order_automation() returns integer language plpgsql security definer set search_path=public as $$declare o orders;checked jsonb;ready boolean;n integer:=0;begin
 perform pg_advisory_xact_lock(17092027);
 for o in select * from orders where auto_processing and status='new' order by created_at,id for update loop
  checked:=order_stock_check(o.items,o.delivered,o.id);
  ready:=jsonb_array_length(checked)>0 and not exists(select 1 from jsonb_array_elements(checked)x where x->>'state'<>'available');
  if ready or checked is distinct from o.stock_check then
   update orders set stock_check=checked,stock_checked_at=now(),status=case when ready then 'confirmed' else status end,auto_confirmed_at=case when ready then now() else auto_confirmed_at end,payment_revision=payment_revision+case when ready then 1 else 0 end where id=o.id;
  end if;
  if ready then n:=n+1;insert into audit_log(table_name,record_id,action,actor,details) values('orders',o.id::text,'automatically_confirmed',null,jsonb_build_object('stock_check',checked,'payment_pending',o.approved_payment_method is null));end if;
 end loop;return n;
end;$$;
revoke all on function process_order_automation() from public,anon,authenticated;
grant execute on function process_order_automation() to service_role;

create function read_order_inbox(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb;begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and (permissions ? 'bestellungen' or permissions ? 'lieferung')))) then raise exception 'FORBIDDEN';end if;
 select coalesce(jsonb_agg(entry order by created_at,id),'[]') into result from(
  select to_jsonb(o)||jsonb_build_object('stock_check',order_stock_check(o.items,o.delivered,o.id)) as entry,e.created_at,o.id from order_inbox_events e join orders o on o.id=e.order_id
  where not exists(select 1 from order_inbox_seen s where s.order_id=o.id and s.user_id=p_actor) order by e.created_at,o.id limit 50
 ) entries;return jsonb_build_object('orders',result,'revision',(select max(order_updated_at) from orders));
end;$$;
create function acknowledge_order_inbox(p_order uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and (permissions ? 'bestellungen' or permissions ? 'lieferung')))) then raise exception 'FORBIDDEN';end if;
 insert into order_inbox_seen(order_id,user_id) select order_id,p_actor from order_inbox_events where order_id=p_order on conflict do nothing;
end;$$;
revoke all on function read_order_inbox(uuid),acknowledge_order_inbox(uuid,uuid) from public,anon,authenticated;
grant execute on function read_order_inbox(uuid),acknowledge_order_inbox(uuid,uuid) to service_role;

-- Start actual dispatch once for the planned day, rather than claiming a delivery solely because a clock passed.
create function start_delivery_tour(p_date date,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare o orders;n integer:=0;skipped integer:=0;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and permissions ? 'lieferung'))) then raise exception 'FORBIDDEN';end if;
 if p_date is distinct from (now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Eine Tour kann nur am tatsächlichen Liefertag gestartet werden.';end if;
 for o in select * from orders where delivery_date=p_date and status in('confirmed','partial') order by route_position nulls last,id for update loop
  if o.approved_payment_method is null then skipped:=skipped+1;continue;end if;
  update orders set status='delivering',delivery_started_at=now(),delivery_started_by=p_actor,payment_revision=payment_revision+1 where id=o.id;
  insert into audit_log(table_name,record_id,action,actor,details) values('orders',o.id::text,'delivery_started',p_actor,jsonb_build_object('delivery_date',p_date));n:=n+1;
 end loop;return jsonb_build_object('started',n,'payment_pending',skipped);
end;$$;
revoke all on function start_delivery_tour(date,uuid) from public,anon,authenticated;
grant execute on function start_delivery_tour(date,uuid) to service_role;
