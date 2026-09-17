-- A setup record can be revised/reset; fiscal records remain immutable.
create or replace function immutable_record() returns trigger language plpgsql as $$begin
 if TG_TABLE_NAME in('sales','closings') and coalesce((to_jsonb(OLD)->>'test_mode')::boolean,false) then return coalesce(NEW,OLD);end if;
 raise exception 'Journal records are immutable';end;$$;
create or replace function save_sale(p_id uuid,p_lines jsonb,p_payment text,p_actor uuid,p_returns jsonb default '[]',p_discount integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$declare l jsonb;p products;items jsonb:='[]';q integer;g integer:=0;n integer:=0;d integer:=0;a integer;b integer;unit integer;s sales;cfg jsonb;st staff;begin
 perform pg_advisory_xact_lock(17092027);select * into s from sales where id=p_id;if found then return to_jsonb(s);end if;
 select value into cfg from settings where id=1;select * into st from staff where user_id=p_actor;
 if not st.active or not (st.role='owner' or st.permissions @> '["kasse"]') then raise exception 'FORBIDDEN';end if;
 if coalesce((cfg->>'live_mode')::boolean,false) then raise exception 'TSE adapter required';end if;
 if p_discount<0 or p_discount>coalesce((cfg->>'discount_percent')::integer,10) or(p_discount>0 and st.role<>'owner' and not st.permissions @> '["rabatt"]') then raise exception 'Discount forbidden';end if;
 if p_payment not in('cash','card') then raise exception 'Payment invalid';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct x->>'id') from jsonb_array_elements(p_lines)x) then raise exception 'Duplicate article';end if;
 for l in select value from jsonb_array_elements(p_lines) order by value->>'id' loop
 select * into p from products where id=l->>'id' and active for update;if not found or p.deposit_cents is null then raise exception 'Article unavailable';end if;
 q:=(l->>'quantity')::integer;if q<1 or q>1000 then raise exception 'Quantity invalid';end if;
 if p.stock is not null and p.stock<q then raise exception 'Insufficient stock';end if;
 unit:=round(p.price_cents*(100-p_discount)/100.0);a:=q*unit;b:=q*p.deposit_cents;
 g:=g+a+b;n:=n+round(a*100.0/(100+p.tax_rate))+round(b*100.0/(100+p.deposit_tax_rate));d:=d+b;
 items:=items||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q,'price_cents',unit,'original_price_cents',p.price_cents,'deposit_cents',p.deposit_cents,'tax_rate',p.tax_rate,'deposit_tax_rate',p.deposit_tax_rate));
 if p.stock is not null then update products set stock=stock-q where id=p.id;insert into stock_movements(product_id,delta,reason,actor) values(p.id,-q,'setup:sale:'||p_id,p_actor);end if;
 end loop;
 for l in select value from jsonb_array_elements(p_returns) loop
 q:=(l->>'quantity')::integer;b:=(l->>'deposit_cents')::integer;if q<1 or q>1000 or b not in(8,15,25,150,240,285,330,310,342,450,510) then raise exception 'Return invalid';end if;
 d:=d-q*b;g:=g-q*b;n:=n-round(q*b*100.0/119);items:=items||jsonb_build_array(jsonb_build_object('id','return-'||b,'name','Pfandrücknahme','quantity',-q,'price_cents',0,'deposit_cents',b,'tax_rate',19,'deposit_tax_rate',19));end loop;
 if jsonb_array_length(items)=0 then raise exception 'Empty sale';end if;
 insert into sales(id,items,total_cents,net_cents,tax_cents,deposit_cents,payment,actor,discount_percent,actor_name) values(p_id,items,g,n,g-n,d,p_payment,p_actor,p_discount,st.name) returning * into s;return to_jsonb(s);end;$$;
create or replace function close_business_period(p_kind text,p_period text,p_actor uuid,p_opening integer default 0,p_counted integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$declare t jsonb;c closings;begin
 perform pg_advisory_xact_lock(17092027);
 if p_kind not in('day','month') or (p_kind='day' and p_period !~ '^\d{4}-\d{2}-\d{2}$') or(p_kind='month' and p_period !~ '^\d{4}-\d{2}$') then raise exception 'Period invalid';end if;
 select jsonb_build_object('gross',coalesce(sum(total_cents),0),'net',coalesce(sum(net_cents),0),'tax',coalesce(sum(tax_cents),0),'deposit',coalesce(sum(deposit_cents),0),'cash',coalesce(sum(total_cents) filter(where payment='cash'),0),'card',coalesce(sum(total_cents) filter(where payment='card'),0),'count',count(*),'opening',p_opening,'counted',p_counted,'difference',p_counted-p_opening-coalesce(sum(total_cents) filter(where payment='cash'),0),'first_number',min(number),'last_number',max(number)) into t from sales where to_char(created_at at time zone 'Europe/Berlin',case when p_kind='day' then 'YYYY-MM-DD' else 'YYYY-MM' end)=p_period and test_mode;
 insert into closings(kind,period,totals,actor) values(p_kind,p_period,t,p_actor) on conflict(kind,period,test_mode) do update set totals=excluded.totals,actor=excluded.actor,created_at=now() returning * into c;return to_jsonb(c);end;$$;
create or replace function save_delivery(p_order uuid,p_id uuid,p_items jsonb,p_revision integer,p_actor uuid,p_finalize boolean default false,p_signature text default null,p_signed_name text default '') returns jsonb language plpgsql security definer set search_path=public as $$declare o orders;d deliveries;c customers;l jsonb;oi jsonb;rows jsonb:='[]';q integer;remaining integer;g integer:=0;n integer:=0;dp integer:=0;a integer;b integer;inv invoices;done boolean;begin
 perform pg_advisory_xact_lock(17092027);select * into o from orders where id=p_order for update;if not found or o.status in('cancelled','new') then raise exception 'Order must be confirmed';end if;
 select * into d from deliveries where id=p_id for update;
 if found then if d.order_id<>p_order then raise exception 'Order mismatch';end if;if d.status='delivered' then return to_jsonb(d);end if;if d.revision<>p_revision then raise exception 'Revision conflict';end if;end if;
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
 if p_signed_name='' then raise exception 'Recipient required';end if;
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
 if coalesce(c.invoice_email,true) then insert into mail_outbox(kind,reference_id,recipient,subject,body) values('invoice_document',inv.id,o.email,'Elias – Rechnung RE-'||inv.number,'Die Rechnung zur gelieferten Ware finden Sie im Anhang. Vielen Dank für Ihre Bestellung.');end if;
 end if;return to_jsonb(d);end;$$;
create or replace function reset_setup(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$declare m record;begin
 perform pg_advisory_xact_lock(17092027);
 if coalesce((select (value->>'live_mode')::boolean from settings where id=1),false) or (select role from staff where user_id=p_actor)<>'owner' then raise exception 'Forbidden';end if;
 for m in select product_id,sum(delta) delta from stock_movements where reason like 'setup:%' group by product_id loop update products set stock=stock-m.delta where id=m.product_id and stock is not null;end loop;
 delete from stock_movements where reason like 'setup:%';delete from mail_outbox where kind in('delivery_document','invoice_document');delete from invoices where mode='setup';delete from deliveries where mode='setup';update orders set delivered='{}',status=case when status in('partial','completed','delivering') then 'confirmed' else status end,eta_start=null,eta_end=null,delivery_date=null,route_position=null;delete from sales where test_mode;delete from closings where test_mode;
 insert into audit_log(table_name,action,actor,details) values('setup','reset',p_actor,'{"reason":"Explicit owner reset of setup transactions"}');end;$$;
revoke all on function save_sale(uuid,jsonb,text,uuid,jsonb,integer),close_business_period(text,text,uuid,integer,integer),save_delivery(uuid,uuid,jsonb,integer,uuid,boolean,text,text),reset_setup(uuid) from public,anon,authenticated;
grant execute on function save_sale(uuid,jsonb,text,uuid,jsonb,integer),close_business_period(text,text,uuid,integer,integer),save_delivery(uuid,uuid,jsonb,integer,uuid,boolean,text,text),reset_setup(uuid) to service_role;
