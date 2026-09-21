-- Missing subscription delivery windows are saved atomically with the command.
-- Internal helper; callers below perform customer ownership/staff authorization first.
create function ensure_subscription_windows(p_customer uuid,p_windows jsonb) returns void language plpgsql security definer set search_path=public as $$
declare existing jsonb;w jsonb;
begin
 select windows into existing from customers where id=p_customer for update;
 if not found then raise exception 'HINWEIS:Kunde nicht gefunden.';end if;
 if jsonb_array_length(coalesce(existing,'[]'))>0 then return;end if;
 if p_windows is null or jsonb_typeof(p_windows)<>'array' then raise exception 'HINWEIS:Bitte zuerst mögliche Lieferzeiten für das Abo ergänzen.';end if;
 if jsonb_array_length(p_windows) not between 1 and 21 then raise exception 'HINWEIS:Bitte mindestens eine Lieferzeit ergänzen.';end if;
 for w in select value from jsonb_array_elements(p_windows) loop
  if coalesce(w->>'day','') !~ '^[1-7]$' or coalesce(w->>'from','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(w->>'to','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'from'>=w->>'to' then
   raise exception 'HINWEIS:Lieferzeiten prüfen: Wochentag und Endzeit nach Startzeit sind erforderlich.';
  end if;
 end loop;
 update customers set windows=p_windows where id=p_customer;
 -- Apply newly supplied windows to open, unstarted requests that had none.
 update orders set preference_snapshot=jsonb_set(coalesce(preference_snapshot,'{}'),'{windows}',p_windows),delivery_date=null,eta_start=null,eta_end=null,route_position=null
 where customer_id=p_customer and status in ('new','confirmed','partial') and delivery_started_at is null
 and jsonb_array_length(coalesce(preference_snapshot->'windows','[]'))=0;
end;$$;
revoke all on function ensure_subscription_windows(uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function save_delivery_subscription(p_value jsonb,p_actor uuid,p_customer boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
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
  perform ensure_subscription_windows(c.id,p_value->'delivery_windows');
  c:=order_customer(c.id);rows:=order_product_snapshot(p_value->'items');
  if d<=(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Bitte einen Starttermin frühestens ab morgen wählen.';end if;
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

create or replace function create_staff_order(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare
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
 if nullif(p_value->>'interval','') is not null then perform ensure_subscription_windows((p_value->>'customer_id')::uuid,p_value->'delivery_windows');end if;
 c:=order_customer((p_value->>'customer_id')::uuid);
 today:=(now() at time zone 'Europe/Berlin')::date;first_date:=(p_value->>'delivery_date')::date;
 if first_date is null or first_date<=today then raise exception 'HINWEIS:Bitte einen Liefertermin frühestens ab morgen wählen.';end if;
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

create or replace function save_staff_subscription(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;d date;is_active boolean;today date;begin
 perform staff_order_access(p_actor);perform pg_advisory_xact_lock(17092028);
 select * into s from subscriptions where id=(p_value->>'id')::uuid for update;
 if not found then raise exception 'HINWEIS:Lieferautomatik nicht gefunden.';end if;
 if s.revision is distinct from (p_value->>'revision')::integer then raise exception 'HINWEIS:Die Lieferautomatik wurde zwischenzeitlich geändert. Bitte neu laden.';end if;
 -- Pausing must work even if customer data or articles have become invalid.
 is_active:=(p_value->>'active')::boolean;d:=(p_value->>'next_date')::date;today:=(now() at time zone 'Europe/Berlin')::date;
 if is_active then
  perform ensure_subscription_windows(s.customer_id,p_value->'delivery_windows');
  c:=order_customer(s.customer_id);perform order_product_snapshot(p_value->'items');
  if d<=today then raise exception 'HINWEIS:Bitte den nächsten Liefertermin frühestens ab morgen wählen.';end if;
  if exists(select 1 from orders where subscription_id=s.id and recurrence_date=d) then raise exception 'HINWEIS:Für diesen Termin besteht bereits eine Bestellung. Bitte einen späteren Termin wählen.';end if;
 end if;
 if length(coalesce(p_value->>'notes',''))>1000 then raise exception 'HINWEIS:Hinweis ist zu lang.';end if;
 update subscriptions set items=p_value->'items',interval=p_value->>'interval',next_date=d,active=is_active,notes=coalesce(p_value->>'notes',''),last_error=null where id=s.id;
 insert into audit_log(table_name,record_id,action,actor,details) values('subscriptions',s.id::text,'staff_updated',p_actor,jsonb_build_object('active',is_active,'next_date',d));
 return jsonb_build_object('id',s.id);
end;$$;
