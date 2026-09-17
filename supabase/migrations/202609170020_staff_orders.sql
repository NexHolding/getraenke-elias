-- Staff-created orders and manageable delivery subscriptions. No stock/financial posting on order creation.
alter table orders add column created_by uuid references auth.users(id), add column requested_delivery_date date;
alter table subscriptions add column notes text not null default '', add column revision integer not null default 0,
 add column anchor_day integer check(anchor_day between 1 and 31), add column last_error text;
update subscriptions set anchor_day=extract(day from next_date)::integer;

create function subscription_revision() returns trigger language plpgsql set search_path=public as $$begin
 if TG_OP='UPDATE' then
  NEW.revision:=OLD.revision+1;
  if NEW.interval is distinct from OLD.interval or (NEW.next_date is distinct from OLD.next_date and coalesce(current_setting('elias.advancing_subscription',true),'')<>'yes') then
   NEW.anchor_day:=extract(day from NEW.next_date)::integer;
  end if;
 end if;
 NEW.anchor_day:=coalesce(NEW.anchor_day,extract(day from NEW.next_date)::integer);return NEW;
end;$$;
create trigger subscription_revision before insert or update on subscriptions for each row execute function subscription_revision();
create trigger subscriptions_audit after insert or update on subscriptions for each row execute function audit_change();

create function subscription_next_date(p_date date,p_interval text,p_anchor integer) returns date language plpgsql immutable set search_path=public as $$declare first_day date;months integer;begin
 if p_interval='weekly' then return p_date+7;end if;
 if p_interval='biweekly' then return p_date+14;end if;
 months:=case p_interval when 'monthly' then 1 when 'quarterly' then 3 when 'halfyearly' then 6 when 'yearly' then 12 else null end;
 if months is null then raise exception 'HINWEIS:Ungültiges Lieferintervall.';end if;
 first_day:=(date_trunc('month',p_date)+make_interval(months=>months))::date;
 return first_day+least(p_anchor,extract(day from first_day+interval '1 month'-interval '1 day')::integer)-1;
end;$$;

create function order_product_snapshot(p_items jsonb) returns jsonb language plpgsql security definer set search_path=public as $$declare l jsonb;p products;rows jsonb:='[]';q integer;begin
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'HINWEIS:Bitte Artikel auswählen.';end if;
 if jsonb_array_length(p_items) not between 1 and 200 or (select count(distinct value->>'id') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'HINWEIS:Artikelauswahl ist leer oder enthält doppelte Artikel.';end if;
 for l in select value from jsonb_array_elements(p_items) loop
  if coalesce(l->>'quantity','') !~ '^[0-9]+$' then raise exception 'HINWEIS:Bitte ganze Mengen angeben.';end if;
  q:=(l->>'quantity')::integer;
  if q not between 1 and 100 then raise exception 'HINWEIS:Mengen müssen zwischen 1 und 100 liegen.';end if;
  select * into p from products where id=l->>'id' and active for share;
  if not found then raise exception 'HINWEIS:Ein Artikel ist nicht mehr verfügbar. Bitte Auswahl aktualisieren.';end if;
  if p.deposit_cents is null then raise exception 'HINWEIS:Bitte zuerst das Pfand aller gewählten Artikel in den Stammdaten hinterlegen.';end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q,'price_cents',p.price_cents,'deposit_cents',p.deposit_cents,'tax_rate',p.tax_rate,'deposit_tax_rate',p.deposit_tax_rate,'pack_count',p.pack_count,'kind',p.kind));
 end loop;return rows;
end;$$;

create function staff_order_access(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or (not finance_readonly and permissions ? 'bestellungen'))) then raise exception 'FORBIDDEN';end if;
end;$$;
create function order_customer(p_id uuid) returns customers language plpgsql security definer set search_path=public as $$declare c customers;begin
 select * into c from customers where id=p_id for share;
 if not found or lower(c.email)='global_admin@getraenke-elias.local' or exists(select 1 from staff where user_id=c.user_id and lower(email)='global_admin@getraenke-elias.local') then raise exception 'HINWEIS:Bitte einen gültigen Kunden auswählen.';end if;
 if trim(c.phone)='' or trim(c.address)='' or trim(c.street)='' or trim(c.house_number)='' or c.postal_code !~ '^[0-9]{5}$' or trim(c.city)='' then raise exception 'HINWEIS:Bitte zuerst Telefon und vollständige Lieferadresse im Kundenprofil ergänzen.';end if;
 return c;
end;$$;

create function create_staff_order(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare
 c customers;o orders;s_id uuid;rows jsonb;first_date date;rhythm text;request uuid;today date;note text;
begin
 perform staff_order_access(p_actor);
 perform pg_advisory_xact_lock(17092028);
 request:=(p_value->>'request_id')::uuid;
 if request is null then raise exception 'HINWEIS:Fehlende Bestellkennung.';end if;
 select * into o from orders where request_id=request;
 if found then
  if o.created_by is distinct from p_actor or o.customer_id is distinct from (p_value->>'customer_id')::uuid then raise exception 'FORBIDDEN';end if;
  return jsonb_build_object('id',o.id,'number',o.number,'subscription_id',o.subscription_id);
 end if;
 c:=order_customer((p_value->>'customer_id')::uuid);
 today:=(now() at time zone 'Europe/Berlin')::date;first_date:=(p_value->>'delivery_date')::date;
 if first_date is null or first_date<today then raise exception 'HINWEIS:Bitte heute oder einen zukünftigen Liefertermin wählen.';end if;
 rows:=order_product_snapshot(p_value->'items');note:=coalesce(p_value->>'notes','');rhythm:=nullif(p_value->>'interval','');
 if length(note)>1000 then raise exception 'HINWEIS:Hinweis ist zu lang.';end if;
 if rhythm is not null then
  insert into subscriptions(customer_id,items,interval,next_date,anchor_day,notes) values(c.id,p_value->'items',rhythm,subscription_next_date(first_date,rhythm,extract(day from first_date)::integer),extract(day from first_date)::integer,note) returning id into s_id;
 end if;
 insert into orders(request_id,created_by,customer_id,customer_name,email,phone,address,street,house_number,postal_code,city,notes,items,status,requested_delivery_date,preference_snapshot,subscription_id,recurrence_date)
 values(request,p_actor,c.id,c.name,c.email,c.phone,c.address,c.street,c.house_number,c.postal_code,c.city,note,rows,'confirmed',first_date,jsonb_build_object('windows',c.windows,'dropoff_allowed',c.dropoff_allowed,'dropoff_note',c.dropoff_note,'latitude',c.latitude,'longitude',c.longitude),s_id,case when s_id is not null then first_date end) returning * into o;
 insert into audit_log(table_name,record_id,action,actor,details) values('orders',o.id::text,'staff_created',p_actor,jsonb_build_object('customer_id',c.id,'subscription_id',s_id,'requested_delivery_date',first_date));
 return jsonb_build_object('id',o.id,'number',o.number,'subscription_id',s_id);
end;$$;

create function save_staff_subscription(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;d date;is_active boolean;today date;begin
 perform staff_order_access(p_actor);perform pg_advisory_xact_lock(17092028);
 select * into s from subscriptions where id=(p_value->>'id')::uuid for update;
 if not found then raise exception 'HINWEIS:Lieferautomatik nicht gefunden.';end if;
 if s.revision is distinct from (p_value->>'revision')::integer then raise exception 'HINWEIS:Die Lieferautomatik wurde zwischenzeitlich geändert. Bitte neu laden.';end if;
 -- Pausing must work even if customer data or articles have become invalid.
 is_active:=(p_value->>'active')::boolean;d:=(p_value->>'next_date')::date;today:=(now() at time zone 'Europe/Berlin')::date;
 if is_active then
  c:=order_customer(s.customer_id);perform order_product_snapshot(p_value->'items');
  if d<today then raise exception 'HINWEIS:Bitte heute oder einen zukünftigen nächsten Termin wählen.';end if;
  if exists(select 1 from orders where subscription_id=s.id and recurrence_date=d) then raise exception 'HINWEIS:Für diesen Termin besteht bereits eine Bestellung. Bitte einen späteren Termin wählen.';end if;
 end if;
 if length(coalesce(p_value->>'notes',''))>1000 then raise exception 'HINWEIS:Hinweis ist zu lang.';end if;
 update subscriptions set items=p_value->'items',interval=p_value->>'interval',next_date=d,active=is_active,notes=coalesce(p_value->>'notes',''),last_error=null where id=s.id;
 insert into audit_log(table_name,record_id,action,actor,details) values('subscriptions',s.id::text,'staff_updated',p_actor,jsonb_build_object('active',is_active,'next_date',d));
 return jsonb_build_object('id',s.id);
end;$$;

-- One order per due run, current product prices, no duplicated first order. Calendar month anchor survives February.
create or replace function generate_subscription_orders() returns integer language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;rows jsonb;n integer:=0;due date;next_day date;today date;begin
 perform pg_advisory_xact_lock(17092028);today:=(now() at time zone 'Europe/Berlin')::date;
 perform set_config('elias.advancing_subscription','yes',true);
 for s in select * from subscriptions where active and next_date<=today order by id for update loop
  begin
   c:=order_customer(s.customer_id);rows:=order_product_snapshot(s.items);due:=s.next_date;
   next_day:=subscription_next_date(due,s.interval,s.anchor_day);
   while next_day<=today loop due:=next_day;next_day:=subscription_next_date(due,s.interval,s.anchor_day);end loop;
   insert into orders(customer_id,customer_name,email,phone,address,street,house_number,postal_code,city,notes,items,status,requested_delivery_date,preference_snapshot,subscription_id,recurrence_date)
   values(c.id,c.name,c.email,c.phone,c.address,c.street,c.house_number,c.postal_code,c.city,concat_ws(E'\n','Wiederkehrende Lieferung',nullif(s.notes,'')),rows,'confirmed',due,jsonb_build_object('windows',c.windows,'dropoff_allowed',c.dropoff_allowed,'dropoff_note',c.dropoff_note,'latitude',c.latitude,'longitude',c.longitude),s.id,due) on conflict do nothing;
   if found then n:=n+1;end if;
   update subscriptions set next_date=next_day,last_error=null where id=s.id;
  exception when others then
   update subscriptions set last_error=case when SQLERRM like 'HINWEIS:%' then substr(SQLERRM,9) else 'Automatik konnte nicht ausgeführt werden. Bitte Stammdaten prüfen.' end where id=s.id;
  end;
 end loop;
 perform set_config('elias.advancing_subscription','',true);return n;
end;$$;
revoke all on function subscription_next_date(date,text,integer),order_product_snapshot(jsonb),staff_order_access(uuid),order_customer(uuid),create_staff_order(jsonb,uuid),save_staff_subscription(jsonb,uuid) from public,anon,authenticated;
grant execute on function create_staff_order(jsonb,uuid),save_staff_subscription(jsonb,uuid) to service_role;

-- Confirmed staff/recurring orders must not send the old "unconfirmed enquiry" wording.
create or replace function queue_order_mail() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;title text;body text;lines text;begin
 select value into cfg from settings where id=1;
 if not coalesce((cfg->>'smtp_enabled')::boolean,false) or coalesce(cfg->>'smtp_from','')='' then return NEW;end if;
 if NEW.status='confirmed' then
  title:='Deine Bestellung bei Getränke Elias – EL-'||lpad(NEW.number::text,5,'0');
  select string_agg((i->>'quantity')||' × '||(i->>'name'),E'\n') into lines from jsonb_array_elements(NEW.items) i;
  body:='Hallo '||NEW.customer_name||','||E'\n\n'||'deine Bestellung wurde erfasst:'||E'\n\n'||lines||E'\n\n'||'Lieferadresse: '||NEW.address||coalesce(E'\nGewünschter Liefertermin: '||to_char(NEW.requested_delivery_date,'DD.MM.YYYY'),'')||E'\nDie konkrete Lieferzeit stimmen wir im Rahmen der Tourenplanung ab.'||case when NEW.notes<>'' then E'\nHinweis: '||NEW.notes else '' end;
 else
  title:='Deine Anfrage bei Getränke Elias – EL-'||lpad(NEW.number::text,5,'0');
  body:='Hallo '||NEW.customer_name||','||E'\n\n'||'vielen Dank für deine Getränkeauswahl. Deine unverbindliche Anfrage ist bei uns eingegangen. Wir bestätigen Verfügbarkeit, aktuelle Preise, Pfand und Liefertermin persönlich. Diese Nachricht ist noch keine Annahme einer Bestellung.';
 end if;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_notification',NEW.id,cfg->>'smtp_from',case when NEW.status='confirmed' then 'Neue Bestellung' else 'Neue Lieferanfrage' end||' EL-'||NEW.number,'Bitte im geschützten Elias-CRM prüfen.');
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_ack',NEW.id,NEW.email,title,body||E'\n\nDein Getränkeshop Elias\nWartbergstraße 3 · 74076 Heilbronn\n07131 / 797 52 25');
 return NEW;
end;$$;
