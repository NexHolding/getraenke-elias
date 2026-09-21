-- Customer access metadata, immutable invoice terms, payment journal and three-stage reminders.
alter table customers add column payment_method text not null default 'invoice' check(payment_method in('cash','card','invoice'));
alter table invoices add column payment_method text not null default 'invoice' check(payment_method in('cash','card','invoice')),
 add column payment_terms_days integer check(payment_terms_days between 1 and 365),add column due_date date;
create table invoice_payments(id uuid primary key default gen_random_uuid(),invoice_id uuid not null unique references invoices(id) on delete cascade,
 amount_cents integer not null check(amount_cents>=0),method text not null check(method in('cash','card','bank')),paid_at timestamptz not null,
 actor uuid not null references auth.users(id),source text not null check(source in('delivery','manual')),created_at timestamptz not null default now());
create table invoice_reminders(id uuid primary key default gen_random_uuid(),invoice_id uuid not null references invoices(id) on delete cascade,
 stage integer not null check(stage between 1 and 3),mail_id uuid not null unique references mail_outbox(id),created_at timestamptz not null default now(),unique(invoice_id,stage));
alter table invoice_payments enable row level security;alter table invoice_reminders enable row level security;
revoke all on invoice_payments,invoice_reminders from anon,authenticated;
grant select on invoice_payments,invoice_reminders to service_role;
create function protect_invoice_payment() returns trigger language plpgsql as $$begin raise exception 'Payment journal is immutable';end;$$;
create trigger protect_invoice_payment before update on invoice_payments for each row execute function protect_invoice_payment();
revoke all on function protect_invoice_payment() from public,anon,authenticated;

create function customer_login_status(p_ids uuid[]) returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb;begin
 select coalesce(jsonb_agg(jsonb_build_object('customer_id',c.id,'user_id',u.id,'email',u.email,'confirmed',u.email_confirmed_at is not null,'has_password',coalesce(u.encrypted_password,'')<>'')), '[]') into result
 from customers c left join auth.users u on lower(u.email)=lower(c.email) and(c.user_id is null or c.user_id=u.id)
 where c.id=any(p_ids) and lower(c.email)<>'global_admin@getraenke-elias.local';return result;
end;$$;
revoke all on function customer_login_status(uuid[]) from public,anon,authenticated;grant execute on function customer_login_status(uuid[]) to service_role;

create or replace function invoice_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;payment jsonb;pref text;begin
 if TG_OP='UPDATE' then
  if (to_jsonb(NEW)-array['status','paid_at','paid_by']) is distinct from (to_jsonb(OLD)-array['status','paid_at','paid_by']) then raise exception 'Invoice content is immutable';end if;
  if row(NEW.status,NEW.paid_at,NEW.paid_by) is distinct from row(OLD.status,OLD.paid_at,OLD.paid_by) and coalesce(current_setting('elias.invoice_payment',true),'')<>'yes' then raise exception 'Use payment booking';end if;
 else
  select value into cfg from settings where id=1;
  NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number','vat_id',cfg->>'vat_id');
  select payment_method into pref from customers where id=NEW.customer_id;pref:=coalesce(pref,'invoice');
  payment:=coalesce(nullif(current_setting('elias.delivery_payment',true),''),'{}')::jsonb;
  if pref<>'invoice' then
   if payment->>'delivery_id' is distinct from NEW.delivery_id::text or payment->>'expected_method' is distinct from pref or not coalesce((payment->>'confirmed')::boolean,false) or coalesce(payment->>'method','') not in('cash','card') then raise exception 'HINWEIS:Bar- oder EC-Zahlung vor Abschluss der Lieferung bestätigen.';end if;
   NEW.payment_method:=payment->>'method';NEW.status:='paid';NEW.paid_at:=now();NEW.paid_by:=(payment->>'actor')::uuid;
  else NEW.payment_method:='invoice';end if;
  NEW.payment_terms_days:=greatest(1,least(365,coalesce((cfg->>'invoice_payment_days')::integer,14)));
  NEW.due_date:=(NEW.created_at at time zone 'Europe/Berlin')::date+case when NEW.payment_method='invoice' then NEW.payment_terms_days else 0 end;
 end if;return NEW;
end;$$;
create function record_delivery_payment() returns trigger language plpgsql security definer set search_path=public as $$begin
 if NEW.status='paid' then
 insert into invoice_payments(invoice_id,amount_cents,method,paid_at,actor,source) values(NEW.id,NEW.total_cents,NEW.payment_method,NEW.paid_at,NEW.paid_by,'delivery');
 insert into audit_log(table_name,record_id,action,actor,details) values('invoices',NEW.id::text,'payment_received',NEW.paid_by,jsonb_build_object('amount_cents',NEW.total_cents,'method',NEW.payment_method,'source','delivery'));
 end if;return NEW;end;$$;
create trigger record_delivery_payment after insert on invoices for each row execute function record_delivery_payment();
revoke all on function record_delivery_payment() from public,anon,authenticated;

create function save_delivery_payment(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb;pref text;d deliveries;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and permissions @> '["lieferung"]'))) then raise exception 'FORBIDDEN';end if;
 select * into d from deliveries where id=(p_value->>'id')::uuid;
 if found and d.status='delivered' then
  if d.order_id is distinct from (p_value->>'order_id')::uuid then raise exception 'FORBIDDEN';end if;return to_jsonb(d);
 end if;
 select coalesce(c.payment_method,'invoice') into pref from orders o left join customers c on c.id=o.customer_id where o.id=(p_value->>'order_id')::uuid;
 if coalesce((p_value->>'finalize')::boolean,false) and coalesce(p_value->>'expected_payment_method','invoice') is distinct from pref then raise exception 'HINWEIS:Zahlungsart wurde geändert. Lieferung neu öffnen und prüfen.';end if;
 perform set_config('elias.delivery_payment',jsonb_build_object('delivery_id',p_value->>'id','expected_method',pref,'method',p_value->>'payment_method','confirmed',coalesce((p_value->>'payment_confirmed')::boolean,false),'actor',p_actor)::text,true);
 result:=save_delivery((p_value->>'order_id')::uuid,(p_value->>'id')::uuid,p_value->'items',(p_value->>'revision')::integer,p_actor,(p_value->>'finalize')::boolean,p_value->>'signature',p_value->>'signed_name');
 perform set_config('elias.delivery_payment','',true);return result;
end;$$;
revoke all on function save_delivery_payment(jsonb,uuid) from public,anon,authenticated;grant execute on function save_delivery_payment(jsonb,uuid) to service_role;

create function mark_invoice_paid(p_id uuid,p_method text,p_paid_on date,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare i invoices;payment invoice_payments;today date;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and role='owner' and active) then raise exception 'FORBIDDEN';end if;
 select * into i from invoices where id=p_id for update;if not found then raise exception 'HINWEIS:Rechnung nicht gefunden.';end if;
 if i.status='paid' then return to_jsonb(i);end if;
 if i.status<>'open' then raise exception 'HINWEIS:Nur offene Rechnungen können bezahlt werden.';end if;
 today:=(now() at time zone 'Europe/Berlin')::date;
 if p_method is null or p_method not in('cash','card','bank') or p_paid_on is null or p_paid_on>today or p_paid_on<(i.created_at at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Zahlungsart und Zahlungstag prüfen.';end if;
 insert into invoice_payments(invoice_id,amount_cents,method,paid_at,actor,source) values(i.id,i.total_cents,p_method,(p_paid_on+time '12:00') at time zone 'Europe/Berlin',p_actor,'manual') returning * into payment;
 perform set_config('elias.invoice_payment','yes',true);
 update invoices set status='paid',paid_at=payment.paid_at,paid_by=p_actor where id=i.id returning * into i;
 perform set_config('elias.invoice_payment','',true);
 update mail_outbox set status='failed',error='Zahlung eingegangen – Mahnung nicht versendet.' where reference_id=i.id and kind like 'invoice_reminder_%' and status='pending';
 insert into audit_log(table_name,record_id,action,actor,details) values('invoices',i.id::text,'payment_received',p_actor,jsonb_build_object('amount_cents',i.total_cents,'method',p_method,'paid_on',p_paid_on,'payment_id',payment.id));
 return to_jsonb(i);
end;$$;
revoke all on function mark_invoice_paid(uuid,text,date,uuid) from public,anon,authenticated;grant execute on function mark_invoice_paid(uuid,text,date,uuid) to service_role;

create function queue_invoice_reminders() returns integer language plpgsql security definer set search_path=public as $$declare i invoices;previous record;stage integer;mid uuid;n integer:=0;cfg jsonb;today date;begin
 perform pg_advisory_xact_lock(17092027);select value into cfg from settings where id=1;
 if not coalesce((cfg->>'invoice_reminders_enabled')::boolean,true) then return 0;end if;
 today:=(now() at time zone 'Europe/Berlin')::date;
 -- Never send demands for setup documents or retrospectively invent due dates for legacy invoices.
 for i in select * from invoices where status='open' and mode='live' and payment_method='invoice' and due_date<today and total_cents>0 order by id for update loop
  select r.stage,m.status,m.sent_at into previous from invoice_reminders r join mail_outbox m on m.id=r.mail_id where r.invoice_id=i.id order by r.stage desc limit 1;
  if found then
   if previous.stage>=3 or previous.status<>'sent' or previous.sent_at is null or today<(previous.sent_at at time zone 'Europe/Berlin')::date+7 then continue;end if;
   stage:=previous.stage+1;
  else stage:=1;end if;
  insert into mail_outbox(kind,reference_id,recipient,subject,body) values('invoice_reminder_'||stage,i.id,i.customer_snapshot->>'email','Getränke Elias – '||stage||'. Mahnung zu RE-'||lpad(i.number::text,6,'0'),
   'Guten Tag '||(i.customer_snapshot->>'name')||E',

zu unserer Rechnung RE-'||lpad(i.number::text,6,'0')||' vom '||to_char(i.created_at at time zone 'Europe/Berlin','DD.MM.YYYY')||' über '||replace(to_char(i.total_cents/100.0,'FM999999990.00'),'.',',')||' EUR ist noch kein Zahlungseingang erfasst. Das Zahlungsziel war der '||to_char(i.due_date,'DD.MM.YYYY')||E'.

Bitte begleichen Sie den offenen Betrag innerhalb der nächsten sieben Tage unter Angabe der Rechnungsnummer. Falls Sie bereits bezahlt haben oder Rückfragen bestehen, kontaktieren Sie uns bitte. Es werden keine automatischen Mahngebühren berechnet.

Die ursprüngliche Rechnung finden Sie im Anhang.

Ihr Getränkeshop Elias
07131 / 797 52 25') on conflict(kind,reference_id) do nothing returning id into mid;
  if mid is not null then insert into invoice_reminders(invoice_id,stage,mail_id) values(i.id,stage,mid);n:=n+1;end if;
 end loop;return n;
end;$$;
revoke all on function queue_invoice_reminders() from public,anon,authenticated;grant execute on function queue_invoice_reminders() to service_role;

create or replace function public.archive_customer_mail() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 if NEW.kind not in ('order_ack','delivery_document','invoice_document') and NEW.kind not like 'invoice_reminder_%' and NEW.kind not like 'order_schedule_%' then return NEW;end if;
 if NEW.kind='order_ack' or NEW.kind like 'order_schedule_%' then select customer_id into cid from orders where id=NEW.reference_id;
 elsif NEW.kind='delivery_document' then select customer_id into cid from deliveries where id=NEW.reference_id;
 else select customer_id into cid from invoices where id=NEW.reference_id;end if;
 if cid is null then select id into cid from customers where lower(email)=lower(NEW.recipient) limit 1;end if;
 insert into customer_communications(source_key,customer_id,kind,recipient,subject,body,status,error,created_at,sent_at)
 values('outbox:'||NEW.id,cid,NEW.kind,NEW.recipient,NEW.subject,NEW.body,NEW.status,NEW.error,NEW.created_at,NEW.sent_at)
 on conflict(source_key) do update set status=excluded.status,error=excluded.error,sent_at=excluded.sent_at;
 return NEW;
end;$$;
revoke all on function public.archive_customer_mail() from public,anon,authenticated;

create function order_mail_details(o orders) returns text language plpgsql stable set search_path=public as $$declare lines text;amount integer;begin
 select string_agg((i->>'quantity')||' × '||(i->>'name')||' · '||replace(to_char(((i->>'quantity')::integer*((i->>'price_cents')::integer+coalesce((i->>'deposit_cents')::integer,0)))/100.0,'FM999999990.00'),'.',',')||' EUR inkl. Pfand',E'
'),sum((i->>'quantity')::integer*((i->>'price_cents')::integer+coalesce((i->>'deposit_cents')::integer,0))) into lines,amount from jsonb_array_elements(o.items)i;
 return coalesce(lines,'')||E'

Gesamt inkl. Pfand: '||replace(to_char(coalesce(amount,0)/100.0,'FM999999990.00'),'.',',')||' EUR'||E'
Lieferadresse: '||o.address||case when o.delivery_date is not null then E'
Geplanter Liefertermin: '||to_char(o.delivery_date,'DD.MM.YYYY')||case when o.eta_start is not null then ' · '||o.eta_start||coalesce('–'||o.eta_end,'') else '' end when o.requested_delivery_date is not null then E'
Gewünschter Liefertermin: '||to_char(o.requested_delivery_date,'DD.MM.YYYY')||' (noch nicht bestätigt)' else E'
Liefertermin: folgt nach Tourenplanung.' end;
end;$$;
revoke all on function order_mail_details(orders) from public,anon,authenticated;
create or replace function queue_order_mail() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;title text;body text;begin
 select value into cfg from settings where id=1;
 title:=case when NEW.status='confirmed' then 'Deine Bestellung' else 'Deine Lieferanfrage' end||' bei Getränke Elias – EL-'||lpad(NEW.number::text,5,'0');
 body:='Hallo '||NEW.customer_name||E',

'||case when NEW.status='confirmed' then 'deine Bestellung wurde erfasst:' else 'deine unverbindliche Lieferanfrage ist eingegangen. Dies ist noch keine Annahme der Bestellung; Verfügbarkeit und Liefertermin werden bestätigt.' end||E'

'||order_mail_details(NEW)||E'

Dein Getränkeshop Elias
07131 / 797 52 25';
 if coalesce(cfg->>'smtp_from','')<>'' then insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_notification',NEW.id,cfg->>'smtp_from','Neue Bestellung / Anfrage EL-'||NEW.number,'Bitte im geschützten Elias-CRM prüfen.');end if;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_ack',NEW.id,NEW.email,title,body);return NEW;
end;$$;
create function queue_order_schedule_mail() returns trigger language plpgsql security definer set search_path=public as $$declare k text;begin
 if NEW.status not in('confirmed','delivering') or row(NEW.status,NEW.delivery_date,NEW.eta_start,NEW.eta_end) is not distinct from row(OLD.status,OLD.delivery_date,OLD.eta_start,OLD.eta_end) then return NEW;end if;
 k:='order_schedule_'||md5(jsonb_build_array(NEW.status,NEW.delivery_date,NEW.eta_start,NEW.eta_end)::text);
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values(k,NEW.id,NEW.email,'Getränke Elias – Bestellbestätigung / Liefertermin EL-'||NEW.number,'Hallo '||NEW.customer_name||E',

hier ist der aktuelle Stand deiner bestätigten Bestellung:

'||order_mail_details(NEW)||E'

Dein Getränkeshop Elias
07131 / 797 52 25') on conflict(kind,reference_id) do nothing;return NEW;
end;$$;
revoke all on function queue_order_schedule_mail() from public,anon,authenticated;
create trigger order_schedule_mail after update of status,delivery_date,eta_start,eta_end on orders for each row execute function queue_order_schedule_mail();

-- Respect paused reminders at dispatch time and measure worker leases from claim, not order creation.
create or replace function claim_mail() returns setof mail_outbox language plpgsql security definer set search_path=public as $$declare reminders_enabled boolean;begin
 select coalesce((value->>'invoice_reminders_enabled')::boolean,true) into reminders_enabled from settings where id=1;
 update mail_outbox set status='uncertain',error='Worker unterbrochen; Zustellung vor erneutem Versand prüfen.' where status='sending' and claimed_at<now()-interval '15 minutes';
 return query update mail_outbox set status='sending',claimed_at=now() where id in(select id from mail_outbox where status='pending' and (kind not like 'invoice_reminder_%' or reminders_enabled) order by created_at limit 5 for update skip locked) returning *;
end;$$;

create function allow_customer_access(p_id uuid) returns boolean language plpgsql security definer set search_path=public as $$declare n integer;begin
 insert into request_limits(key) values('customer-access:'||p_id) on conflict(key) do update set count=case when request_limits.window_start<now()-interval '1 minute' then 1 else request_limits.count+1 end,window_start=case when request_limits.window_start<now()-interval '1 minute' then now() else request_limits.window_start end returning count into n;return n=1;
end;$$;
revoke all on function allow_customer_access(uuid) from public,anon,authenticated;grant execute on function allow_customer_access(uuid) to service_role;
