alter table subscriptions add column customer_requested boolean not null default false;
-- Shared customer/staff subscription editor: authorization, optimistic concurrency and replay protection.
create table subscription_commands(id uuid primary key,subscription_id uuid not null references subscriptions(id) on delete cascade,actor uuid not null references auth.users(id),payload jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table subscription_commands enable row level security;
revoke all on subscription_commands from anon,authenticated;
grant all on subscription_commands to service_role;
create function save_delivery_subscription(p_value jsonb,p_actor uuid,p_customer boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare c customers;s subscriptions;cmd subscription_commands;rows jsonb;d date;active_value boolean;result jsonb;
begin
 perform pg_advisory_xact_lock(17092028);
 select * into c from customers where id=(p_value->>'customer_id')::uuid;
 if not found or lower(c.email)='global_admin@getraenke-elias.local' then raise exception 'FORBIDDEN';end if;
 if p_customer then
  if c.user_id is distinct from p_actor or p_actor is null then raise exception 'FORBIDDEN';end if;
 else
  if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or (not finance_readonly and (permissions ? 'kunden' or permissions ? 'bestellungen')))) then raise exception 'FORBIDDEN';end if;
 end if;
 select * into cmd from subscription_commands where id=(p_value->>'request_id')::uuid;
 if found then
  if cmd.actor is distinct from p_actor or cmd.payload is distinct from p_value then raise exception 'HINWEIS:Vorgangskennung bereits verwendet. Bitte neu laden.';end if;
  return cmd.result;
 end if;
 select * into s from subscriptions where id=(p_value->>'id')::uuid for update;
 if found then
  if s.customer_id<>c.id then raise exception 'FORBIDDEN';end if;
  if s.revision is distinct from (p_value->>'revision')::integer then raise exception 'HINWEIS:Das Lieferabo wurde zwischenzeitlich geändert. Bitte neu laden.';end if;
 elsif p_value->>'revision' is not null then raise exception 'HINWEIS:Lieferabo nicht gefunden.';
 end if;
 d:=(p_value->>'next_date')::date;active_value:=(p_value->>'active')::boolean;
 if d is null or active_value is null or p_value->>'interval' not in('weekly','biweekly','monthly','quarterly','halfyearly','yearly') then raise exception 'HINWEIS:Termin und Rhythmus prüfen.';end if;
 if active_value then
  c:=order_customer(c.id);rows:=order_product_snapshot(p_value->'items');
  if d<(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Bitte heute oder einen zukünftigen Starttermin wählen.';end if;
  if p_customer and (exists(select 1 from jsonb_array_elements(rows)x where x->>'kind'<>'beverage') or (select coalesce(sum((x->>'quantity')::integer) filter(where (x->>'pack_count')::integer>1),0) from jsonb_array_elements(rows)x)<4) then raise exception 'HINWEIS:Bitte mindestens vier Getränkekisten für dein Lieferabo auswählen.';end if;
  if exists(select 1 from orders where subscription_id=s.id and recurrence_date=d) then raise exception 'HINWEIS:Für diesen Termin besteht bereits eine Bestellung. Bitte einen späteren Termin wählen.';end if;
 end if;
 if length(coalesce(p_value->>'notes',''))>1000 then raise exception 'HINWEIS:Hinweis zu lang.';end if;
 if s.id is null then
  insert into subscriptions(id,customer_id,items,interval,next_date,active,notes,customer_requested) values((p_value->>'id')::uuid,c.id,p_value->'items',p_value->>'interval',d,active_value,coalesce(p_value->>'notes',''),p_customer) returning * into s;
 else
  update subscriptions set items=p_value->'items',interval=p_value->>'interval',next_date=d,active=active_value,notes=coalesce(p_value->>'notes',''),last_error=null where id=s.id returning * into s;
 end if;
 result:=to_jsonb(s);
 insert into subscription_commands(id,subscription_id,actor,payload,result) values((p_value->>'request_id')::uuid,s.id,p_actor,p_value,result);
 insert into audit_log(table_name,record_id,action,actor,details) values('subscriptions',s.id::text,case when p_customer then 'customer_saved' else 'staff_saved' end,p_actor,jsonb_build_object('customer_id',c.id,'active',s.active,'next_date',s.next_date));
 return result;
end;$$;
revoke all on function save_delivery_subscription(jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function save_delivery_subscription(jsonb,uuid,boolean) to service_role;

-- Stable PDF bytes shared by portal, CRM and e-mail. Source records remain the accounting truth.
create table business_documents(
 id uuid primary key default gen_random_uuid(),
 delivery_id uuid unique references deliveries(id) on delete cascade,
 invoice_id uuid unique references invoices(id) on delete cascade,
 filename text not null,pdf_base64 text not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 check((delivery_id is null)<>(invoice_id is null))
);
alter table business_documents enable row level security;
revoke all on business_documents from public,anon,authenticated,service_role;
grant select,insert,delete on business_documents to service_role;

-- Finalization is replayable even after the order became complete.
create or replace function save_delivery(p_order uuid,p_id uuid,p_items jsonb,p_revision integer,p_actor uuid,p_finalize boolean default false,p_signature text default null,p_signed_name text default '') returns jsonb language plpgsql security definer set search_path=public as $$declare o orders;d deliveries;c customers;l jsonb;oi jsonb;rows jsonb:='[]';q integer;remaining integer;g integer:=0;n integer:=0;dp integer:=0;a integer;b integer;inv invoices;done boolean;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or (not finance_readonly and permissions ? 'lieferung'))) then raise exception 'FORBIDDEN';end if;
 select * into o from orders where id=p_order for update;if not found then raise exception 'Order not found';end if;
 select * into d from deliveries where id=p_id for update;
 if found then if d.order_id<>p_order then raise exception 'Order mismatch';end if;if d.status='delivered' then return to_jsonb(d);end if;if d.revision<>p_revision then raise exception 'Revision conflict';end if;end if;
 if o.status in('cancelled','new','completed') then raise exception 'Order must be confirmed';end if;
 if coalesce((select (value->>'live_mode')::boolean from settings where id=1),false) then raise exception 'HINWEIS:Echtbetrieb noch nicht freigegeben.';end if;
 if jsonb_array_length(p_items)<1 or (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct x->>'id') from jsonb_array_elements(p_items)x) then raise exception 'Invalid items';end if;
 for l in select value from jsonb_array_elements(p_items) order by value->>'id' loop
 select value into oi from jsonb_array_elements(o.items) where value->>'id'=l->>'id';if not found then raise exception 'Unknown item';end if;
 q:=(l->>'quantity')::integer;remaining:=(oi->>'quantity')::integer-coalesce((o.delivered->>(l->>'id'))::integer,0);if q<0 or q>remaining then raise exception 'Quantity exceeds outstanding';end if;
 if q>0 then rows:=rows||jsonb_build_array(oi||jsonb_build_object('quantity',q,'tax_rate',coalesce((oi->>'tax_rate')::integer,19),'deposit_tax_rate',coalesce((oi->>'deposit_tax_rate')::integer,19)));
 a:=q*(oi->>'price_cents')::integer;b:=q*coalesce((oi->>'deposit_cents')::integer,0);g:=g+a+b;dp:=dp+b;n:=n+round(a*100.0/(100+coalesce((oi->>'tax_rate')::integer,19)))+round(b*100.0/(100+coalesce((oi->>'deposit_tax_rate')::integer,19)));end if;end loop;
 if jsonb_array_length(rows)=0 then raise exception 'No delivered quantities';end if;
 select * into c from customers where id=o.customer_id;
 if p_finalize then
 if coalesce(p_signature,'')='' and not coalesce((o.preference_snapshot->>'dropoff_allowed')::boolean,false) then raise exception 'Signature required';end if;
 if trim(coalesce(p_signed_name,''))='' then raise exception 'Recipient required';end if;
 for l in select value from jsonb_array_elements(rows) order by value->>'id' loop
 perform 1 from products where id=l->>'id' for update;
 if (select stock from products where id=l->>'id') is not null then
 update products set stock=stock-(l->>'quantity')::integer where id=l->>'id' and stock>=(l->>'quantity')::integer;if not found then raise exception 'Insufficient stock';end if;
 insert into stock_movements(product_id,delta,reason,actor) values(l->>'id',-(l->>'quantity')::integer,'setup:delivery:'||p_id,p_actor);end if;
 o.delivered:=jsonb_set(o.delivered,array[l->>'id'],to_jsonb(coalesce((o.delivered->>(l->>'id'))::integer,0)+(l->>'quantity')::integer));end loop;
 end if;
 insert into deliveries(id,order_id,customer_id,items,actor,status,signature,signed_name,delivered_at) values(p_id,p_order,o.customer_id,rows,p_actor,case when p_finalize then 'delivered' else 'draft' end,p_signature,p_signed_name,case when p_finalize then now() else null end) on conflict(id) do update set items=excluded.items,actor=excluded.actor,status=excluded.status,signature=excluded.signature,signed_name=excluded.signed_name,delivered_at=excluded.delivered_at,revision=deliveries.revision+1 returning * into d;
 if p_finalize then
 select not exists(select 1 from jsonb_array_elements(o.items) i where (i->>'quantity')::integer>coalesce((o.delivered->>(i->>'id'))::integer,0)) into done;
 update orders set delivered=o.delivered,status=case when done then 'completed' else 'partial' end,delivery_date=case when done then delivery_date else null end,eta_start=case when done then eta_start else null end,eta_end=case when done then eta_end else null end where id=p_order;
 insert into invoices(order_id,delivery_id,customer_id,customer_snapshot,items,total_cents,net_cents,tax_cents,deposit_cents) values(p_order,p_id,o.customer_id,jsonb_build_object('name',o.customer_name,'email',o.email,'address',o.address),rows,g,n,g-n,dp) returning * into inv;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('delivery_document',p_id,o.email,'Elias – Lieferschein LS-'||d.number,'Vielen Dank. Den Lieferschein für die übergebenen Mengen finden Sie im Anhang. Noch offene Positionen bleiben bei uns vorgemerkt.');
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('invoice_document',inv.id,o.email,'Elias – Rechnung RE-'||inv.number,'Die Rechnung zur gelieferten Ware finden Sie im Anhang. Vielen Dank für Ihre Bestellung.');
 end if;return to_jsonb(d);end;$$;
create or replace function delivery_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare o jsonb;cfg jsonb;l jsonb;delivered jsonb;begin
 if TG_OP='UPDATE' and OLD.status='delivered' then raise exception 'Signed delivery is immutable';end if;
 select to_jsonb(x) into o from orders x where id=NEW.order_id;select value into cfg from settings where id=1;
 if NEW.status='delivered' then delivered:=o->'delivered';for l in select value from jsonb_array_elements(NEW.items) loop delivered:=jsonb_set(delivered,array[l->>'id'],to_jsonb(coalesce((delivered->>(l->>'id'))::integer,0)+(l->>'quantity')::integer));end loop;o:=jsonb_set(o,'{delivered}',delivered);end if;
 NEW.order_snapshot:=o;NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number','vat_id',cfg->>'vat_id');return NEW;end;$$;

create or replace function invoice_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;begin
 if TG_OP='UPDATE' and (to_jsonb(NEW)-array['status','paid_at','paid_by']) is distinct from (to_jsonb(OLD)-array['status','paid_at','paid_by']) then raise exception 'Invoice content is immutable';end if;
 if TG_OP='INSERT' then select value into cfg from settings where id=1;NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number','vat_id',cfg->>'vat_id');end if;return NEW;end;$$;


-- Customer-created subscriptions remain delivery requests until staff confirmation.
create or replace function generate_subscription_orders() returns integer language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;rows jsonb;n integer:=0;due date;next_day date;today date;begin
 perform pg_advisory_xact_lock(17092028);today:=(now() at time zone 'Europe/Berlin')::date;
 perform set_config('elias.advancing_subscription','yes',true);
 for s in select * from subscriptions where active and next_date<=today order by id for update loop
  begin
   c:=order_customer(s.customer_id);rows:=order_product_snapshot(s.items);due:=s.next_date;
   next_day:=subscription_next_date(due,s.interval,s.anchor_day);
   while next_day<=today loop due:=next_day;next_day:=subscription_next_date(due,s.interval,s.anchor_day);end loop;
   insert into orders(customer_id,customer_name,email,phone,address,street,house_number,postal_code,city,notes,items,status,requested_delivery_date,preference_snapshot,subscription_id,recurrence_date)
   values(c.id,c.name,c.email,c.phone,c.address,c.street,c.house_number,c.postal_code,c.city,concat_ws(E'\n','Wiederkehrende Lieferung',nullif(s.notes,'')),rows,case when s.customer_requested then 'new' else 'confirmed' end,due,jsonb_build_object('windows',c.windows,'dropoff_allowed',c.dropoff_allowed,'dropoff_note',c.dropoff_note,'latitude',c.latitude,'longitude',c.longitude),s.id,due) on conflict do nothing;
   if found then n:=n+1;end if;
   update subscriptions set next_date=next_day,last_error=null where id=s.id;
  exception when others then
   update subscriptions set last_error=case when SQLERRM like 'HINWEIS:%' then substr(SQLERRM,9) else 'Automatik konnte nicht ausgeführt werden. Bitte Stammdaten prüfen.' end where id=s.id;
  end;
 end loop;
 perform set_config('elias.advancing_subscription','',true);return n;
end;$$;

-- Keep a visible outbox even when SMTP setup is incomplete.
create or replace function queue_order_mail() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;title text;body text;lines text;begin
 select value into cfg from settings where id=1;
 if NEW.status='confirmed' then
  title:='Deine Bestellung bei Getränke Elias – EL-'||lpad(NEW.number::text,5,'0');
  select string_agg((i->>'quantity')||' × '||(i->>'name'),E'\n') into lines from jsonb_array_elements(NEW.items) i;
  body:='Hallo '||NEW.customer_name||','||E'\n\n'||'deine Bestellung wurde erfasst:'||E'\n\n'||lines||E'\n\n'||'Lieferadresse: '||NEW.address||coalesce(E'\nGewünschter Liefertermin: '||to_char(NEW.requested_delivery_date,'DD.MM.YYYY'),'')||E'\nDie konkrete Lieferzeit stimmen wir im Rahmen der Tourenplanung ab.'||case when NEW.notes<>'' then E'\nHinweis: '||NEW.notes else '' end;
 else
  title:='Deine Anfrage bei Getränke Elias – EL-'||lpad(NEW.number::text,5,'0');
  body:='Hallo '||NEW.customer_name||','||E'\n\n'||'vielen Dank für deine Getränkeauswahl. Deine unverbindliche Anfrage ist bei uns eingegangen. Wir bestätigen Verfügbarkeit, aktuelle Preise, Pfand und Liefertermin persönlich. Diese Nachricht ist noch keine Annahme einer Bestellung.';
 end if;
 if coalesce(cfg->>'smtp_from','')<>'' then insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_notification',NEW.id,cfg->>'smtp_from',case when NEW.status='confirmed' then 'Neue Bestellung' else 'Neue Lieferanfrage' end||' EL-'||NEW.number,'Bitte im geschützten Elias-CRM prüfen.');end if;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_ack',NEW.id,NEW.email,title,body||E'\n\nDein Getränkeshop Elias\nWartbergstraße 3 · 74076 Heilbronn\n07131 / 797 52 25');
 return NEW;
end;$$;
