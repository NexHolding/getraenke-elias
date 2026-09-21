-- New orders need at least one local calendar day of lead time.
-- Protect the shared website, staff, app and automation paths in the database.
create function enforce_delivery_lead_time() returns trigger language plpgsql security definer set search_path=public as $$
declare earliest date;local_now timestamp := clock_timestamp() at time zone 'Europe/Berlin'; schedule_changed boolean;
begin
 earliest := (NEW.created_at at time zone 'Europe/Berlin')::date + 1;
 if TG_OP='INSERT' then
  if NEW.requested_delivery_date < earliest then
   raise exception 'HINWEIS:Neue Bestellungen können frühestens am Folgetag geliefert werden.';
  end if;
  schedule_changed := NEW.delivery_date is not null;
 else
  schedule_changed := NEW.delivery_date is distinct from OLD.delivery_date or NEW.eta_start is distinct from OLD.eta_start or NEW.eta_end is distinct from OLD.eta_end;
 end if;
 if NEW.delivery_date is not null and (schedule_changed or (TG_OP='UPDATE' and NEW.status='delivering' and OLD.status is distinct from NEW.status)) then
  if NEW.delivery_date < greatest(earliest,NEW.requested_delivery_date,local_now::date) then
   raise exception 'HINWEIS:Liefertermin zu früh. Neue Bestellungen sind frühestens am Folgetag lieferbar.';
  end if;
  -- Starting an already planned tour is allowed; assigning a new past slot is not.
  if schedule_changed and NEW.delivery_date=local_now::date and NEW.eta_start is not null and NEW.eta_start::time <= local_now::time then
   raise exception 'HINWEIS:Das Lieferzeitfenster liegt bereits in der Vergangenheit. Bitte die Tour neu planen.';
  end if;
 end if;
 return NEW;
end;$$;
create trigger orders_delivery_lead_time before insert or update on orders for each row execute function enforce_delivery_lead_time();
revoke all on function enforce_delivery_lead_time() from public,anon,authenticated;

create function enforce_subscription_lead_time() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if NEW.active and coalesce(current_setting('elias.advancing_subscription',true),'') <> 'yes' then
  if TG_OP='INSERT' or NEW.next_date is distinct from OLD.next_date or not OLD.active then
   if NEW.next_date <= (clock_timestamp() at time zone 'Europe/Berlin')::date then
    raise exception 'HINWEIS:Bitte einen Lieferabo-Termin frühestens ab morgen wählen.';
   end if;
  end if;
 end if;
 return NEW;
end;$$;
create trigger subscriptions_delivery_lead_time before insert or update on subscriptions for each row execute function enforce_subscription_lead_time();
revoke all on function enforce_subscription_lead_time() from public,anon,authenticated;

-- Prepare recurring requests one day before their due date. If a run was missed,
-- retain the recurrence identity/cadence but request delivery no earlier than tomorrow.
create or replace function generate_subscription_orders() returns integer language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;rows jsonb;n integer:=0;due date;next_day date;today date;begin
 perform pg_advisory_xact_lock(17092028);today:=(now() at time zone 'Europe/Berlin')::date;
 perform set_config('elias.advancing_subscription','yes',true);
 for s in select * from subscriptions where active and next_date<=today+1 order by id for update loop
  begin
   c:=order_customer(s.customer_id);rows:=order_product_snapshot(s.items);due:=s.next_date;
   next_day:=subscription_next_date(due,s.interval,s.anchor_day);
   while next_day<=today+1 loop due:=next_day;next_day:=subscription_next_date(due,s.interval,s.anchor_day);end loop;
   insert into orders(customer_id,customer_name,email,phone,address,street,house_number,postal_code,city,notes,items,status,requested_delivery_date,preference_snapshot,subscription_id,recurrence_date)
   values(c.id,c.name,c.email,c.phone,c.address,c.street,c.house_number,c.postal_code,c.city,concat_ws(E'\n','Wiederkehrende Lieferung',nullif(s.notes,'')),rows,case when s.customer_requested then 'new' else 'confirmed' end,greatest(due,today+1),jsonb_build_object('windows',c.windows,'dropoff_allowed',c.dropoff_allowed,'dropoff_note',c.dropoff_note,'latitude',c.latitude,'longitude',c.longitude),s.id,due) on conflict do nothing;
   if found then n:=n+1;end if;
   update subscriptions set next_date=next_day,last_error=null where id=s.id;
  exception when others then
   update subscriptions set last_error=case when SQLERRM like 'HINWEIS:%' then substr(SQLERRM,9) else 'Automatik konnte nicht ausgeführt werden. Bitte Stammdaten prüfen.' end where id=s.id;
  end;
 end loop;
 perform set_config('elias.advancing_subscription','',true);return n;
end;$$;

-- Only remove unstarted, invalid route assignments. Preserve completed delivery
-- documents, invoices, in-transit tours and the customer's requested date.
with invalid as (
 select id,delivery_date,eta_start,eta_end,route_position from orders
 where status in ('confirmed','partial') and delivery_started_at is null and delivery_date is not null
 and (delivery_date < greatest((created_at at time zone 'Europe/Berlin')::date+1,requested_delivery_date,(now() at time zone 'Europe/Berlin')::date)
 or (delivery_date=(now() at time zone 'Europe/Berlin')::date and eta_start is not null and eta_start::time <= (now() at time zone 'Europe/Berlin')::time))
), cleared as (
 update orders o set delivery_date=null,eta_start=null,eta_end=null,route_position=null from invalid i where o.id=i.id returning o.id
)
insert into audit_log(table_name,record_id,action,details)
select 'orders',i.id::text,'delivery_plan_lead_time_corrected',jsonb_build_object('previous_plan',to_jsonb(i),'reason','Minimum next-day delivery; no past time slots') from invalid i join cleared c on c.id=i.id;
