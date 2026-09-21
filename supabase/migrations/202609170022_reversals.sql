-- Append-only counter receipts. Fiscal production remains blocked until SIGN DE is integrated.
alter table products drop constraint products_tax_rate_check;
alter table products drop constraint products_deposit_tax_rate_check;
alter table products add constraint products_tax_rate_check check(tax_rate between 0 and 100),
 add constraint products_deposit_tax_rate_check check(deposit_tax_rate between 0 and 100);
alter table products drop constraint products_kind_check;
alter table products add constraint products_kind_check check(kind in ('beverage','rental','nonfood'));
alter table products add column return_eligible boolean not null default false;
alter table products add constraint return_nonfood_only check(not return_eligible or kind='nonfood');
create or replace function default_product_tax(p_deposit boolean) returns integer language sql stable security definer set search_path=public as $$
 select coalesce((select (value->>case when p_deposit then 'default_deposit_tax_rate' else 'default_tax_rate' end)::integer from settings where id=1),19)
$$;
alter table sales add column record_type text not null default 'sale' check(record_type in('sale','cancellation','return')),
 add column original_sale_id uuid references sales(id), add column original_number bigint,
 add column reversal_reason text not null default '', add column reversal_note text not null default '';
create index sales_original_sale on sales(original_sale_id);
create index sales_receipt_number on sales(number);
create function capture_return_policy() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.record_type='sale' then
  select jsonb_agg(i.value||jsonb_build_object('return_eligible',coalesce(p.return_eligible,false),'pack_count',coalesce(p.pack_count,1)) order by i.n) into new.items
   from jsonb_array_elements(new.items) with ordinality i(value,n) left join products p on p.id=i.value->>'id';
 end if;
 return new;
end;$$;
create trigger capture_return_policy_before_insert before insert on sales for each row execute function capture_return_policy();
revoke all on function capture_return_policy() from public,anon,authenticated;
create or replace function save_product(p_value jsonb,p_expected_revision integer,p_actor uuid) returns boolean language plpgsql security definer set search_path=public as $$declare p products;old_stock integer;old_revision integer;old_pack integer;old_loose integer;begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or permissions @> '["artikel"]')) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(17092027);perform pg_advisory_xact_lock(17092026);select * into p from jsonb_populate_record(null::products,p_value);
 select stock,revision,pack_count,loose_stock into old_stock,old_revision,old_pack,old_loose from products where id=p.id for update;
 if found then if p_expected_revision is null or old_revision<>p_expected_revision then return false;end if;
 if p.stock is distinct from old_stock then raise exception 'HINWEIS:Bestand über Inventur oder Bestandskorrektur ändern.';end if;
 if p.pack_count<>old_pack and (coalesce(old_stock,0)>0 or old_loose>0 or exists(select 1 from inventory_lines l join inventory_runs r on r.id=l.run_id where l.product_id=p.id and r.status in('counting','review'))) then raise exception 'HINWEIS:Gebinde bei vorhandenem Bestand oder laufender Inventur nicht ändern. Neue Artikelvariante anlegen.';end if;
 update products set sku=p.sku,name=p.name,category=p.category,pack_count=p.pack_count,volume_ml=p.volume_ml,price_cents=p.price_cents,source_unit_price_cents=p.source_unit_price_cents,deposit_cents=p.deposit_cents,tax_rate=p.tax_rate,deposit_tax_rate=p.deposit_tax_rate,min_stock=p.min_stock,target_stock=p.target_stock,supplier_id=p.supplier_id,reorder_enabled=p.reorder_enabled,active=p.active,verified=p.verified,barcode=p.barcode,source=p.source,kind=p.kind,group_name=p.group_name,variant=p.variant,image_url=p.image_url,image_source=p.image_source,deposit_profile=p.deposit_profile,data_note=p.data_note,return_eligible=coalesce(p.return_eligible,false) where id=p.id;
 else if p.stock is not null then raise exception 'HINWEIS:Anfangsbestand über Inventur erfassen.';end if;p.return_eligible:=coalesce(p.return_eligible,false);p.revision:=0;p.loose_stock:=0;p.stock_version:=0;p.cost_net_cents:=null;insert into products select p.*;end if;
 return true;end;$$;
create function reverse_sale(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 st staff; original sales; result sales; existing sales; p products; v_id uuid; kind text; reason text; note text;
 selected jsonb; l jsonb; i integer; q integer; original_q integer; prior integer; signed_q integer; restock boolean;
 units bigint; newunits bigint; old_stock integer;
 items jsonb:='[]'; g integer:=0; n integer:=0; dp integer:=0; goods_net integer; deposit_net integer; a integer; b integer; cfg jsonb; today date;
begin
 perform pg_advisory_xact_lock(17092027);
 select * into st from staff where user_id=p_actor;
 if not found or not st.active or (st.role<>'owner' and (st.finance_readonly or not st.permissions @> '["storno"]')) then raise exception 'FORBIDDEN';end if;
 if coalesce((p_value->>'confirmed')::boolean,false)=false then raise exception 'HINWEIS:Erstattung bzw. Zahlungskorrektur bestätigen.';end if;
 v_id:=(p_value->>'id')::uuid;
 select * into existing from sales where id=v_id;
 if found then
  if existing.actor is distinct from p_actor or existing.original_sale_id is distinct from (p_value->>'original_sale_id')::uuid then raise exception 'FORBIDDEN';end if;
  return to_jsonb(existing);
 end if;
 select * into original from sales where id=(p_value->>'original_sale_id')::uuid for update;
 if not found or original.record_type<>'sale' then raise exception 'HINWEIS:Originalbeleg nicht gefunden. Gegenbelege können nicht erneut storniert werden.';end if;
 select value into cfg from settings where id=1;
 if not original.test_mode or coalesce((cfg->>'live_mode')::boolean,false) then raise exception 'HINWEIS:Für Echtbelege muss der fiskalisierte Storno-Adapter eingerichtet sein.';end if;
 kind:=p_value->>'kind';reason:=trim(p_value->>'reason');note:=trim(coalesce(p_value->>'note',''));
 if kind not in('cancellation','return') or reason is null or char_length(reason)<3 or char_length(reason)>200 or char_length(note)>1000 then raise exception 'HINWEIS:Art und Stornogrund prüfen.';end if;
 if kind='return' and reason<>'Freiwillige Rückgabe' then raise exception 'HINWEIS:Rücknahmegrund prüfen.';end if;
 if kind='cancellation' and reason not in('Kunde hat nicht bezahlt','Falscher Artikel / Eingabefehler','Doppelt gebucht','Beschädigung / Bruch','Abgelaufene oder mangelhafte Ware','Gesetzlicher Widerruf (geprüft)','Sonstige Buchungskorrektur') then raise exception 'HINWEIS:Korrekturgrund prüfen.';end if;
 if char_length(note)<3 then raise exception 'HINWEIS:Erläuterung erforderlich.';end if;
 if p_value->>'payment' is null or p_value->>'payment' not in('cash','card') then raise exception 'HINWEIS:Erstattungsart wählen.';end if;
 if jsonb_typeof(p_value->'lines') is distinct from 'array' or jsonb_array_length(p_value->'lines')=0 or jsonb_array_length(p_value->'lines')>211 then raise exception 'HINWEIS:Positionen auswählen.';end if;
 if (select count(*) from jsonb_array_elements(p_value->'lines'))<>(select count(distinct x->>'index') from jsonb_array_elements(p_value->'lines') x) then raise exception 'HINWEIS:Position doppelt gewählt.';end if;
 today:=(now() at time zone 'Europe/Berlin')::date;
 if kind='return' and (today<(original.created_at at time zone 'Europe/Berlin')::date or today>(original.created_at at time zone 'Europe/Berlin')::date+14) then raise exception 'HINWEIS:Die freiwillige 14-Tage-Rücknahmefrist ist abgelaufen. Gesetzliche Mängelrechte bleiben unberührt.';end if;
 for selected in select value from jsonb_array_elements(p_value->'lines') order by (value->>'index')::integer loop
  i:=(selected->>'index')::integer;q:=(selected->>'quantity')::integer;restock:=coalesce((selected->>'restock')::boolean,false);
  if i is null or i<0 or i>=jsonb_array_length(original.items) or q is null or q<1 or q>1000 then raise exception 'HINWEIS:Ungültige Position oder Menge.';end if;
  l:=original.items->i;original_q:=(l->>'quantity')::integer;
  if original_q=0 then raise exception 'HINWEIS:Leere Originalposition.';end if;
  if kind='return' and (original_q<0 or not coalesce((l->>'return_eligible')::boolean,false)) then raise exception 'HINWEIS:Dieser Artikel wurde nicht mit freiwilliger 14-Tage-Rücknahme verkauft.';end if;
  select coalesce(sum(abs((x->>'quantity')::integer)),0) into prior from sales s cross join lateral jsonb_array_elements(s.items)x where s.original_sale_id=original.id and (x->>'original_line')::integer=i;
  if prior+q>abs(original_q) then raise exception 'HINWEIS:Die Menge wurde bereits ganz oder teilweise erstattet.';end if;
  signed_q:=case when original_q>0 then -q else q end;
  a:=signed_q*(l->>'price_cents')::integer;b:=signed_q*(l->>'deposit_cents')::integer;
  -- Cumulative cent allocation: several partial refunds exactly reverse the original rounded taxes.
  goods_net:=(case when original_q>0 then -1 else 1 end)*(round((prior+q)*(l->>'price_cents')::numeric*100/(100+(l->>'tax_rate')::integer))-round(prior*(l->>'price_cents')::numeric*100/(100+(l->>'tax_rate')::integer)));
  deposit_net:=(case when original_q>0 then -1 else 1 end)*(round((prior+q)*(l->>'deposit_cents')::numeric*100/(100+(l->>'deposit_tax_rate')::integer))-round(prior*(l->>'deposit_cents')::numeric*100/(100+(l->>'deposit_tax_rate')::integer)));
  items:=items||jsonb_build_array(l||jsonb_build_object('quantity',signed_q,'original_line',i,'net_cents',goods_net,'deposit_net_cents',deposit_net,'restock',restock));
  g:=g+a+b;n:=n+goods_net+deposit_net;dp:=dp+b;
  if original_q>0 and restock then
   select * into p from products where id=l->>'id' for update;
   if not found then raise exception 'HINWEIS:Artikel fehlt für die Bestandsrückbuchung.';end if;
   units:=q*coalesce((l->>'pack_count')::integer,p.pack_count);old_stock:=p.stock;
   if p.stock is not null then newunits:=p.stock::bigint*p.pack_count+p.loose_stock+units;update products set stock=(newunits/p.pack_count)::integer,loose_stock=(newunits%p.pack_count)::integer where id=p.id;end if;
   insert into stock_movements(product_id,delta,delta_units,reason,actor) values(p.id,case when old_stock is null then q else (newunits/p.pack_count)::integer-old_stock end,units,'setup:reversal:'||v_id||':'||reason,p_actor);
  end if;
 end loop;
 insert into sales(id,items,total_cents,net_cents,tax_cents,deposit_cents,payment,actor,actor_name,record_type,original_sale_id,original_number,reversal_reason,reversal_note)
 values(v_id,items,g,n,g-n,dp,p_value->>'payment',p_actor,case when lower(st.email)='global_admin@getraenke-elias.local' then 'Administration' else st.name end,kind,original.id,original.number,reason,note) returning * into result;
 insert into audit_log(table_name,record_id,action,actor,details) values('sales',v_id::text,kind,p_actor,jsonb_build_object('original_sale_id',original.id,'reason',reason,'booking_date',today,'payment',p_value->>'payment','total_cents',g));
 return to_jsonb(result);
end;$$;
revoke all on function reverse_sale(jsonb,uuid) from public,anon,authenticated;
grant execute on function reverse_sale(jsonb,uuid) to service_role;
