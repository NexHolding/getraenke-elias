-- Signed delivery with the same deposit return denominations as the POS.
alter table deliveries add column deposit_returns jsonb not null default '[]',
 add column total_cents integer,add column payment_method text check(payment_method in('cash','card','invoice'));
-- Negative delivery settlements are documented refunds; manual payments retain their existing rule.
alter table invoice_payments drop constraint invoice_payments_amount_cents_check;
alter table invoice_payments add constraint invoice_payments_amount_cents_check check(amount_cents>=0 or source='delivery');
create or replace function save_delivery(p_order uuid,p_id uuid,p_items jsonb,p_revision integer,p_actor uuid,p_finalize boolean default false,p_signature text default null,p_signed_name text default '') returns jsonb language plpgsql security definer set search_path=public as $$declare o orders;d deliveries;c customers;l jsonb;oi jsonb;rows jsonb:='[]';q integer;remaining integer;g integer:=0;n integer:=0;dp integer:=0;a integer;b integer;inv invoices;done boolean;refunds jsonb:='[]';requested_returns jsonb;payment jsonb;begin
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
 payment:=coalesce(nullif(current_setting('elias.delivery_payment',true),''),'{}')::jsonb;
 requested_returns:=coalesce(payment->'returns','[]');
 if jsonb_typeof(requested_returns)<>'array' or jsonb_array_length(requested_returns)>11 then raise exception 'HINWEIS:Pfandrücknahme prüfen.';end if;
 if (select count(*) from jsonb_array_elements(requested_returns))<>(select count(distinct x->>'deposit_cents') from jsonb_array_elements(requested_returns)x) then raise exception 'HINWEIS:Pfandart doppelt erfasst.';end if;
 for l in select value from jsonb_array_elements(requested_returns) loop
  if coalesce(l->>'quantity','')!~'^[0-9]+$' or coalesce(l->>'deposit_cents','')!~'^[0-9]+$' then raise exception 'HINWEIS:Pfandmenge ungültig.';end if;
  q:=(l->>'quantity')::integer;b:=(l->>'deposit_cents')::integer;
  if q<1 or q>1000 or b not in(8,15,25,150,240,285,330,310,342,450,510) then raise exception 'HINWEIS:Pfandrücknahme prüfen.';end if;
  refunds:=refunds||jsonb_build_array(jsonb_build_object('id','return-'||b,'name','Pfandrücknahme','quantity',-q,'price_cents',0,'deposit_cents',b,'tax_rate',19,'deposit_tax_rate',19));
  g:=g-q*b;dp:=dp-q*b;n:=n-round(q*b*100.0/119);
 end loop;
 select * into c from customers where id=o.customer_id;
 if p_finalize then
 if coalesce(p_signature,'')!~'^data:image/png;base64,[A-Za-z0-9+/=]+$' then raise exception 'HINWEIS:Kundenunterschrift ist bei jeder Übergabe erforderlich.';end if;
 if trim(coalesce(p_signed_name,''))='' then raise exception 'Recipient required';end if;
 for l in select value from jsonb_array_elements(rows) order by value->>'id' loop
 perform 1 from products where id=l->>'id' for update;
 if (select stock from products where id=l->>'id') is not null then
 update products set stock=stock-(l->>'quantity')::integer where id=l->>'id' and stock>=(l->>'quantity')::integer;if not found then raise exception 'Insufficient stock';end if;
 insert into stock_movements(product_id,delta,reason,actor) values(l->>'id',-(l->>'quantity')::integer,'setup:delivery:'||p_id,p_actor);end if;
 o.delivered:=jsonb_set(o.delivered,array[l->>'id'],to_jsonb(coalesce((o.delivered->>(l->>'id'))::integer,0)+(l->>'quantity')::integer));end loop;
 end if;
 insert into deliveries(id,order_id,customer_id,items,actor,status,signature,signed_name,delivered_at,deposit_returns,total_cents,payment_method) values(p_id,p_order,o.customer_id,rows,p_actor,case when p_finalize then 'delivered' else 'draft' end,p_signature,p_signed_name,case when p_finalize then now() else null end,refunds,g,coalesce(payment->>'method',o.approved_payment_method)) on conflict(id) do update set items=excluded.items,actor=excluded.actor,status=excluded.status,signature=excluded.signature,signed_name=excluded.signed_name,delivered_at=excluded.delivered_at,deposit_returns=excluded.deposit_returns,total_cents=excluded.total_cents,payment_method=excluded.payment_method,revision=deliveries.revision+1 returning * into d;
 if p_finalize then
 select not exists(select 1 from jsonb_array_elements(o.items) i where (i->>'quantity')::integer>coalesce((o.delivered->>(i->>'id'))::integer,0)) into done;
 update orders set delivered=o.delivered,status=case when done then 'completed' else 'partial' end,delivery_date=case when done then delivery_date else null end,eta_start=case when done then eta_start else null end,eta_end=case when done then eta_end else null end where id=p_order;
 insert into invoices(order_id,delivery_id,customer_id,customer_snapshot,items,total_cents,net_cents,tax_cents,deposit_cents) values(p_order,p_id,o.customer_id,jsonb_build_object('name',o.customer_name,'email',o.email,'address',o.address),rows||refunds,g,n,g-n,dp) returning * into inv;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('delivery_document',p_id,o.email,'Elias – Lieferschein LS-'||d.number,'Vielen Dank. Den Lieferschein für die übergebenen Mengen finden Sie im Anhang. Noch offene Positionen bleiben bei uns vorgemerkt.');
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('invoice_document',inv.id,o.email,'Elias – Rechnung RE-'||inv.number,'Die Rechnung zur gelieferten Ware finden Sie im Anhang. Vielen Dank für Ihre Bestellung.');
 end if;return to_jsonb(d);end;$$;
create or replace function invoice_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;payment jsonb;pref text;method text;begin
 if TG_OP='UPDATE' then
  if (to_jsonb(NEW)-array['status','paid_at','paid_by']) is distinct from (to_jsonb(OLD)-array['status','paid_at','paid_by']) then raise exception 'Invoice content is immutable';end if;
  if row(NEW.status,NEW.paid_at,NEW.paid_by) is distinct from row(OLD.status,OLD.paid_at,OLD.paid_by) and coalesce(current_setting('elias.invoice_payment',true),'')<>'yes' then raise exception 'Use payment booking';end if;
 else
  select value into cfg from settings where id=1;
  NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number','vat_id',cfg->>'vat_id');
  select approved_payment_method into pref from orders where id=NEW.order_id;
  if pref is null then raise exception 'HINWEIS:Zahlungsart des Auftrags wurde noch nicht freigegeben.';end if;
  payment:=coalesce(nullif(current_setting('elias.delivery_payment',true),''),'{}')::jsonb;
  method:=coalesce(payment->>'method',pref);
  if method not in('cash','card','invoice') or (method='invoice' and pref<>'invoice') then raise exception 'HINWEIS:Rechnungszahlung muss zuerst im Auftrag freigegeben werden.';end if;
  if method='invoice' and NEW.total_cents<0 then raise exception 'HINWEIS:Pfandguthaben bitte bar oder per EC auszahlen und bestätigen.';end if;
  NEW.payment_method:=method;
  if method<>'invoice' then
   if payment->>'delivery_id' is distinct from NEW.delivery_id::text or payment->>'expected_method' is distinct from pref or (NEW.total_cents<>0 and not coalesce((payment->>'confirmed')::boolean,false)) then raise exception 'HINWEIS:Bar-/EC-Zahlung oder Pfandauszahlung vor Abschluss bestätigen.';end if;
   NEW.status:='paid';NEW.paid_at:=now();NEW.paid_by:=(payment->>'actor')::uuid;
  elsif NEW.total_cents=0 then NEW.status:='paid';NEW.paid_at:=now();NEW.paid_by:=(payment->>'actor')::uuid;
  end if;
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
 if found and d.status='draft' and jsonb_array_length(d.deposit_returns)>0 and not(p_value ? 'returns') then raise exception 'HINWEIS:Pfandrücknahme vorhanden. Bitte Lieferschein neu öffnen.';end if;
 select approved_payment_method into pref from orders where id=(p_value->>'order_id')::uuid;
 if pref is null then raise exception 'HINWEIS:Zahlungsart des Auftrags bitte zuerst unter Bestellungen freigeben.';end if;
 if coalesce((p_value->>'finalize')::boolean,false) and coalesce(p_value->>'expected_payment_method','invoice') is distinct from pref then raise exception 'HINWEIS:Zahlungsart wurde geändert. Lieferung neu öffnen und prüfen.';end if;
 if coalesce(p_value->>'payment_method','') not in('cash','card','invoice') or (p_value->>'payment_method'='invoice' and pref<>'invoice') then raise exception 'HINWEIS:Rechnungszahlung muss zuerst im Auftrag freigegeben werden.';end if;
 perform set_config('elias.delivery_payment',jsonb_build_object('delivery_id',p_value->>'id','expected_method',pref,'method',p_value->>'payment_method','confirmed',coalesce((p_value->>'payment_confirmed')::boolean,false),'actor',p_actor,'returns',coalesce(p_value->'returns','[]'))::text,true);
 result:=save_delivery((p_value->>'order_id')::uuid,(p_value->>'id')::uuid,p_value->'items',(p_value->>'revision')::integer,p_actor,(p_value->>'finalize')::boolean,p_value->>'signature',p_value->>'signed_name');
 perform set_config('elias.delivery_payment','',true);return result;
end;$$;
revoke all on function save_delivery_payment(jsonb,uuid) from public,anon,authenticated;grant execute on function save_delivery_payment(jsonb,uuid) to service_role;



create or replace function record_delivery_payment() returns trigger language plpgsql security definer set search_path=public as $$begin
 if NEW.status='paid' and NEW.total_cents<>0 then
 insert into invoice_payments(invoice_id,amount_cents,method,paid_at,actor,source) values(NEW.id,NEW.total_cents,NEW.payment_method,NEW.paid_at,NEW.paid_by,'delivery');
 insert into audit_log(table_name,record_id,action,actor,details) values('invoices',NEW.id::text,case when NEW.total_cents<0 then 'refund_paid' else 'payment_received' end,NEW.paid_by,jsonb_build_object('amount_cents',NEW.total_cents,'method',NEW.payment_method,'source','delivery'));
 end if;return NEW;end;$$;
