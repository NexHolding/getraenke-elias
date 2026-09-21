-- Customer-only erasure, with immutable commercial records retained separately.
create table customer_account_deletions(
 id uuid primary key,auth_user_id uuid unique,status text not null default 'pending' check(status in('pending','completed')),
 requested_at timestamptz not null default now(),completed_at timestamptz,attempts integer not null default 0,
 retained_business_records boolean not null default false,last_attempt_at timestamptz
);
alter table customer_account_deletions enable row level security;
revoke all on customer_account_deletions from public,anon,authenticated;
grant all on customer_account_deletions to service_role;
alter table customers add column account_deleted_at timestamptz;

create function prepare_customer_account_deletion(p_user uuid,p_request uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare c customers;r customer_account_deletions;sub_ids uuid[];removed_orders uuid[];kept boolean:=false;
begin
 perform pg_advisory_xact_lock(17092028);perform pg_advisory_xact_lock(17092027);
 perform pg_advisory_xact_lock(17092035,hashtext(p_user::text));
 if p_user is null or p_request is null or not exists(select 1 from auth.users where id=p_user) then raise exception 'UNAUTHORIZED';end if;
 if exists(select 1 from staff where user_id=p_user) then raise exception 'FORBIDDEN';end if;
 select * into r from customer_account_deletions where auth_user_id=p_user;
 if found then return jsonb_build_object('id',r.id,'status',r.status,'retained_business_records',r.retained_business_records);end if;
 if exists(select 1 from customer_account_deletions where id=p_request) then raise exception 'FORBIDDEN';end if;
 select * into c from customers where user_id=p_user for update;
 insert into customer_account_deletions(id,auth_user_id) values(p_request,p_user);
 -- Authentication messages/links are not business correspondence; delete their
 -- private attachments and encrypted dispatch payloads via FK cascades.
 delete from customer_communications where auth_user_id=p_user;
 if c.id is not null then
  select coalesce(array_agg(id),'{}') into sub_ids from subscriptions where customer_id=c.id;
  delete from subscription_commands where actor=p_user or subscription_id=any(sub_ids);
  -- Stop recurring orders. Referenced shells keep historical order identity only.
  update subscriptions set active=false,items='[]',notes='',last_error=null where id=any(sub_ids);
  select coalesce(array_agg(o.id),'{}') into removed_orders from orders o where o.customer_id=c.id and o.status in('new','cancelled')
   and not exists(select 1 from deliveries d where d.order_id=o.id) and not exists(select 1 from invoices i where i.order_id=o.id);
  delete from customer_communications where customer_id=c.id and (source_key in(select 'outbox:'||id from mail_outbox where reference_id=any(removed_orders))
   or (kind not in('order_ack','delivery_document','invoice_document') and kind not like 'order_schedule_%' and kind not like 'invoice_reminder_%'));
  delete from mail_outbox where reference_id=any(removed_orders);
  delete from orders where id=any(removed_orders);
  delete from subscriptions s where s.customer_id=c.id and not exists(select 1 from orders o where o.subscription_id=s.id);
  select exists(select 1 from orders where customer_id=c.id) or exists(select 1 from deliveries where customer_id=c.id) or exists(select 1 from invoices where customer_id=c.id) into kept;
  -- Bookkeeping and fulfilled/accepted-order snapshots stay intact. Profile-only
  -- preferences, contact data, coordinates and auth link are actually removed.
  update customers set user_id=null,account_deleted_at=now(),name='Gelöschtes Kundenkonto',email='deleted-'||id||'@account.invalid',phone='',address='',street='',house_number='',postal_code='',city='',notes='',windows='[]',dropoff_allowed=false,dropoff_note='',latitude=null,longitude=null,invoice_email=false where id=c.id;
  -- Audit entries must not silently preserve copies of the deleted profile.
  perform set_config('elias.account_erasure',p_request::text,true);
  update audit_log set details=jsonb_build_object('personal_data_erased',true),actor=null where (table_name='customers' and record_id=c.id::text) or (table_name='subscriptions' and record_id=any(sub_ids::text[])) or (table_name='orders' and record_id=any(removed_orders::text[]));
  perform set_config('elias.account_erasure','',true);
  insert into audit_log(table_name,record_id,action,details) values('customer_account_deletions',p_request::text,'ERASURE',jsonb_build_object('retained_business_records',kept));
  if not kept then
   delete from customer_communications where customer_id=c.id;
   delete from customers where id=c.id;
  end if;
 end if;
 delete from subscription_commands where actor=p_user;
 update customer_account_deletions set retained_business_records=kept where id=p_request;
 return jsonb_build_object('id',p_request,'status','pending','retained_business_records',kept);
end;$$;
revoke all on function prepare_customer_account_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function prepare_customer_account_deletion(uuid,uuid) to service_role;

-- Serialize first-login provisioning with deletion, including a request that
-- started before the deletion job was committed.
create function prevent_deleted_customer_link() returns trigger language plpgsql security definer set search_path=public as $$begin
 if NEW.user_id is not null then
  perform pg_advisory_xact_lock(17092035,hashtext(NEW.user_id::text));
  if exists(select 1 from customer_account_deletions where auth_user_id=NEW.user_id) then
   raise exception 'HINWEIS:Dieses Kundenkonto wird gelöscht.';
  end if;
 end if;
 return NEW;
end;$$;
revoke all on function prevent_deleted_customer_link() from public,anon,authenticated;
create trigger prevent_deleted_customer_link before insert or update of user_id on customers for each row execute function prevent_deleted_customer_link();

-- Keep the journal immutable, allowing only removal of profile/request copies
-- inside the private erasure transaction. No financial journal table is changed.
create function protect_audit_with_personal_erasure() returns trigger language plpgsql security definer set search_path=public as $$
declare request uuid:=nullif(current_setting('elias.account_erasure',true),'')::uuid;
begin
 if TG_OP='UPDATE' and request is not null
  and exists(select 1 from customer_account_deletions where id=request and status='pending')
  and OLD.table_name in('customers','subscriptions','orders')
  and (to_jsonb(NEW)-array['details','actor'])=(to_jsonb(OLD)-array['details','actor'])
  and NEW.actor is null and NEW.details='{"personal_data_erased":true}'::jsonb then return NEW;end if;
 raise exception 'Journal records are immutable';
end;$$;
revoke all on function protect_audit_with_personal_erasure() from public,anon,authenticated;
drop trigger audit_immutable on audit_log;
create trigger audit_immutable before update or delete on audit_log for each row execute function protect_audit_with_personal_erasure();
