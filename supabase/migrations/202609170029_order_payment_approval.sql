-- Per-order customer wishes and explicit staff approval, independent of the customer default.
-- New customers are never granted invoice credit by the database default.
alter table customers alter column payment_method set default 'cash';
alter table orders add column requested_payment_method text check(requested_payment_method in('cash','card','invoice')),
 add column approved_payment_method text check(approved_payment_method in('cash','card','invoice')),
 add column payment_revision integer not null default 0;
-- Preserve the payment expectation of already accepted orders; new inquiries require approval.
update orders o set approved_payment_method=coalesce((select payment_method from customers where id=o.customer_id),'invoice') where status<>'new';
create function order_payment_defaults() returns trigger language plpgsql security definer set search_path=public as $$begin
 if NEW.status<>'new' then
  NEW.approved_payment_method:=coalesce(NEW.approved_payment_method,(select payment_method from customers where id=NEW.customer_id),'cash');
 end if;
 return NEW;
end;$$;
revoke all on function order_payment_defaults() from public,anon,authenticated;
create trigger order_payment_defaults before insert on orders for each row execute function order_payment_defaults();
create function approve_order_payment(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare o orders;original jsonb;method text:=p_value->>'payment_method';next_status text:=p_value->>'status';begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and permissions ? 'bestellungen'))) then raise exception 'FORBIDDEN';end if;
 select * into o from orders where id=(p_value->>'id')::uuid for update;
 if not found or o.status in('completed','cancelled') then raise exception 'HINWEIS:Dieser Auftrag ist abgeschlossen oder fehlt.';end if;
 if (p_value->>'expected_revision')::integer is distinct from o.payment_revision then raise exception 'HINWEIS:Auftrag wurde geändert. Bitte neu laden und erneut prüfen.';end if;
 if method is null or method not in('cash','card','invoice') or next_status is null or next_status not in('new','confirmed','delivering','partial','cancelled') then raise exception 'HINWEIS:Zahlungsart und Status auswählen.';end if;
 if (o.status='partial' and next_status<>'partial') or (next_status='partial' and o.status<>'partial') then raise exception 'HINWEIS:Bei Teilbelieferung bitte ausschließlich die Zahlungsart der Restlieferung ändern.';end if;
 original:=to_jsonb(o);
 update orders set status=next_status,approved_payment_method=case when next_status='new' then null else method end,payment_revision=payment_revision+1 where id=o.id returning * into o;
 insert into audit_log(table_name,record_id,action,actor,details) values('orders',o.id::text,'payment_approved',p_actor,jsonb_build_object('before',original->'approved_payment_method','after',o.approved_payment_method,'requested',o.requested_payment_method,'status',o.status));
 return to_jsonb(o);
end;$$;
revoke all on function approve_order_payment(jsonb,uuid) from public,anon,authenticated;
grant execute on function approve_order_payment(jsonb,uuid) to service_role;
create or replace function invoice_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;payment jsonb;pref text;begin
 if TG_OP='UPDATE' then
  if (to_jsonb(NEW)-array['status','paid_at','paid_by']) is distinct from (to_jsonb(OLD)-array['status','paid_at','paid_by']) then raise exception 'Invoice content is immutable';end if;
  if row(NEW.status,NEW.paid_at,NEW.paid_by) is distinct from row(OLD.status,OLD.paid_at,OLD.paid_by) and coalesce(current_setting('elias.invoice_payment',true),'')<>'yes' then raise exception 'Use payment booking';end if;
 else
  select value into cfg from settings where id=1;
  NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number','vat_id',cfg->>'vat_id');
  select approved_payment_method into pref from orders where id=NEW.order_id;
  if pref is null then raise exception 'HINWEIS:Zahlungsart des Auftrags wurde noch nicht freigegeben.';end if;
  payment:=coalesce(nullif(current_setting('elias.delivery_payment',true),''),'{}')::jsonb;
  if pref<>'invoice' then
   if payment->>'delivery_id' is distinct from NEW.delivery_id::text or payment->>'expected_method' is distinct from pref or not coalesce((payment->>'confirmed')::boolean,false) or coalesce(payment->>'method','') not in('cash','card') then raise exception 'HINWEIS:Bar- oder EC-Zahlung vor Abschluss der Lieferung bestätigen.';end if;
   NEW.payment_method:=payment->>'method';NEW.status:='paid';NEW.paid_at:=now();NEW.paid_by:=(payment->>'actor')::uuid;
  else NEW.payment_method:='invoice';end if;
  NEW.payment_terms_days:=greatest(1,least(365,coalesce((cfg->>'invoice_payment_days')::integer,14)));
  NEW.due_date:=(NEW.created_at at time zone 'Europe/Berlin')::date+case when NEW.payment_method='invoice' then NEW.payment_terms_days else 0 end;
 end if;return NEW;
end;$$;
create or replace function save_delivery_payment(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb;pref text;d deliveries;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or(not finance_readonly and permissions @> '["lieferung"]'))) then raise exception 'FORBIDDEN';end if;
 select * into d from deliveries where id=(p_value->>'id')::uuid;
 if found and d.status='delivered' then
  if d.order_id is distinct from (p_value->>'order_id')::uuid then raise exception 'FORBIDDEN';end if;return to_jsonb(d);
 end if;
 select approved_payment_method into pref from orders where id=(p_value->>'order_id')::uuid;
 if pref is null then raise exception 'HINWEIS:Zahlungsart des Auftrags bitte zuerst unter Bestellungen freigeben.';end if;
 if coalesce((p_value->>'finalize')::boolean,false) and coalesce(p_value->>'expected_payment_method','invoice') is distinct from pref then raise exception 'HINWEIS:Zahlungsart wurde geändert. Lieferung neu öffnen und prüfen.';end if;
 perform set_config('elias.delivery_payment',jsonb_build_object('delivery_id',p_value->>'id','expected_method',pref,'method',p_value->>'payment_method','confirmed',coalesce((p_value->>'payment_confirmed')::boolean,false),'actor',p_actor)::text,true);
 result:=save_delivery((p_value->>'order_id')::uuid,(p_value->>'id')::uuid,p_value->'items',(p_value->>'revision')::integer,p_actor,(p_value->>'finalize')::boolean,p_value->>'signature',p_value->>'signed_name');
 perform set_config('elias.delivery_payment','',true);return result;
end;$$;
revoke all on function save_delivery_payment(jsonb,uuid) from public,anon,authenticated;grant execute on function save_delivery_payment(jsonb,uuid) to service_role;


create or replace function order_mail_details(o orders) returns text language plpgsql stable set search_path=public as $$declare lines text;amount integer;begin
 select string_agg((i->>'quantity')||' × '||(i->>'name')||' · '||replace(to_char(((i->>'quantity')::integer*((i->>'price_cents')::integer+coalesce((i->>'deposit_cents')::integer,0)))/100.0,'FM999999990.00'),'.',',')||' EUR inkl. Pfand',E'
'),sum((i->>'quantity')::integer*((i->>'price_cents')::integer+coalesce((i->>'deposit_cents')::integer,0))) into lines,amount from jsonb_array_elements(o.items)i;
 return coalesce(lines,'')||E'

Gesamt inkl. Pfand: '||replace(to_char(coalesce(amount,0)/100.0,'FM999999990.00'),'.',',')||' EUR'||E'\nZahlungsart: '||case coalesce(o.approved_payment_method,o.requested_payment_method) when 'cash' then 'Bar bei Lieferung' when 'card' then 'EC-Karte bei Lieferung' when 'invoice' then 'Rechnung' else 'Noch abzustimmen' end||case when o.approved_payment_method is null then ' (Kundenwunsch, noch nicht freigegeben)' else ' (bestätigt)' end||E'
Lieferadresse: '||o.address||case when o.delivery_date is not null then E'
Geplanter Liefertermin: '||to_char(o.delivery_date,'DD.MM.YYYY')||case when o.eta_start is not null then ' · '||o.eta_start||coalesce('–'||o.eta_end,'') else '' end when o.requested_delivery_date is not null then E'
Gewünschter Liefertermin: '||to_char(o.requested_delivery_date,'DD.MM.YYYY')||' (noch nicht bestätigt)' else E'
Liefertermin: folgt nach Tourenplanung.' end;
end;$$;

create or replace function queue_order_schedule_mail() returns trigger language plpgsql security definer set search_path=public as $$declare k text;begin
 if NEW.status not in('confirmed','delivering','partial') or row(NEW.status,NEW.delivery_date,NEW.eta_start,NEW.eta_end,NEW.approved_payment_method) is not distinct from row(OLD.status,OLD.delivery_date,OLD.eta_start,OLD.eta_end,OLD.approved_payment_method) then return NEW;end if;
 k:='order_schedule_'||md5(jsonb_build_array(NEW.status,NEW.delivery_date,NEW.eta_start,NEW.eta_end,NEW.approved_payment_method,NEW.payment_revision)::text);
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values(k,NEW.id,NEW.email,'Getränke Elias – Bestellbestätigung / Liefertermin EL-'||NEW.number,'Hallo '||NEW.customer_name||E',

hier ist der aktuelle Stand deiner bestätigten Bestellung:

'||order_mail_details(NEW)||E'

Dein Getränkeshop Elias
07131 / 797 52 25') on conflict(kind,reference_id) do nothing;return NEW;
end;$$;
revoke all on function queue_order_schedule_mail() from public,anon,authenticated;
drop trigger order_schedule_mail on orders;
create trigger order_schedule_mail after update of status,delivery_date,eta_start,eta_end,approved_payment_method on orders for each row execute function queue_order_schedule_mail();
