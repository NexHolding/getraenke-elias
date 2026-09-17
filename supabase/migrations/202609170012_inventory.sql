-- Physical stocktake and attributable stock corrections. Existing stock remains full selling packs.
alter table products add column loose_stock integer not null default 0 check(loose_stock>=0),
 add column cost_net_cents integer check(cost_net_cents>=0),
 add column stock_version bigint not null default 0;
alter table products add constraint products_loose_pack check(loose_stock<pack_count);
create or replace function stock_version_changed() returns trigger language plpgsql as $$begin
 if (NEW.stock,NEW.loose_stock,NEW.pack_count) is distinct from (OLD.stock,OLD.loose_stock,OLD.pack_count) then NEW.stock_version:=OLD.stock_version+1;end if;
 return NEW;end;$$;
create trigger products_stock_version before update on products for each row execute function stock_version_changed();
create table inventory_runs(
 id uuid primary key,number bigint generated always as identity unique,title text not null,location text not null,
 inventory_date date not null,status text not null default 'counting' check(status in('counting','review','applied','cancelled')),
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),created_name text not null,
 submitted_at timestamptz,applied_at timestamptz,applied_by uuid references auth.users(id),applied_name text,
 revision integer not null default 0,business_snapshot jsonb not null,notes text not null default ''
);
create unique index inventory_one_open on inventory_runs ((true)) where status in('counting','review');
create table inventory_lines(
 id uuid primary key default gen_random_uuid(),run_id uuid not null references inventory_runs(id),product_id text not null references products(id),
 product_snapshot jsonb not null,book_units bigint,counted_units bigint check(counted_units>=0),stock_version bigint,
 cost_net_cents integer check(cost_net_cents>=0),reason text not null default '',note text not null default '',
 counted_at timestamptz,counted_by uuid references auth.users(id),counted_name text,
 apply_book_units bigint,applied_units bigint,movement_since_count bigint,revision integer not null default 0,
 unique(run_id,product_id)
);
create table inventory_events(id bigint generated always as identity primary key,run_id uuid not null references inventory_runs(id),line_id uuid references inventory_lines(id),action text not null,before_value jsonb,after_value jsonb,actor uuid not null references auth.users(id),actor_name text not null,created_at timestamptz not null default now());
create table stock_adjustments(
 id uuid primary key,number bigint generated always as identity unique,product_id text not null references products(id),product_snapshot jsonb not null,
 before_units bigint not null,delta_units bigint not null check(delta_units<>0),after_units bigint not null check(after_units>=0),
 reason text not null,note text not null,reference text not null default '',occurred_on date not null,
 created_at timestamptz not null default now(),actor uuid not null references auth.users(id),actor_name text not null,
 reverses_id uuid unique references stock_adjustments(id),business_snapshot jsonb not null
);
alter table stock_movements add column inventory_id uuid references inventory_runs(id),add column adjustment_id uuid references stock_adjustments(id),add column delta_units bigint;
alter table inventory_runs enable row level security;alter table inventory_lines enable row level security;alter table inventory_events enable row level security;alter table stock_adjustments enable row level security;
create or replace function protect_inventory_record() returns trigger language plpgsql as $$begin
 if TG_TABLE_NAME in('inventory_events','stock_adjustments') then raise exception 'Inventory evidence is immutable';end if;
 if TG_TABLE_NAME='inventory_runs' then if OLD.status in('applied','cancelled') then raise exception 'Final inventory is immutable';end if;end if;
 if TG_TABLE_NAME='inventory_lines' then if exists(select 1 from inventory_runs where id=OLD.run_id and status in('applied','cancelled')) then raise exception 'Final inventory line is immutable';end if;end if;
 return coalesce(NEW,OLD);end;$$;
create trigger inventory_runs_protect before update or delete on inventory_runs for each row execute function protect_inventory_record();
create trigger inventory_lines_protect before update or delete on inventory_lines for each row execute function protect_inventory_record();
create trigger inventory_events_protect before update or delete on inventory_events for each row execute function protect_inventory_record();
create trigger stock_adjustments_protect before update or delete on stock_adjustments for each row execute function protect_inventory_record();
-- Even a sale made before the first known stock must invalidate an earlier unknown-stock count.
create or replace function unknown_stock_activity() returns trigger language plpgsql security definer set search_path=public as $$declare i jsonb;begin
 if TG_TABLE_NAME='deliveries' then
  if NEW.status<>'delivered' then return NEW;end if;
  if TG_OP='UPDATE' and OLD.status='delivered' then return NEW;end if;
 end if;
 for i in select value from jsonb_array_elements(NEW.items) loop
  if (i->>'quantity')::integer>0 then update products set stock_version=stock_version+1 where id=i->>'id' and stock is null;end if;
 end loop;return NEW;end;$$;
create trigger sales_unknown_stock after insert on sales for each row execute function unknown_stock_activity();
create trigger deliveries_unknown_stock after insert or update on deliveries for each row execute function unknown_stock_activity();
create sequence inventory_article_number;
create or replace function inventory_command(p_action text,p_value jsonb,p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare st staff;who text;cfg jsonb;r inventory_runs;l inventory_lines;p products;adj stock_adjustments;oldadj stock_adjustments;
 rid uuid;pid text;before_row jsonb;units bigint;actual bigint;movement bigint;newunits bigint;cost integer;v_reason text;v_note text;newid uuid;
begin
 select * into st from staff where user_id=p_actor;
 if st.user_id is null or not st.active or not(st.role='owner' or st.permissions @> '["inventur"]') then raise exception 'FORBIDDEN';end if;
 if p_action in('apply','reopen','cancel','reverse') and st.role<>'owner' then raise exception 'FORBIDDEN';end if;
 who:=case when st.email='global_admin@getraenke-elias.local' then 'Administration' else st.name end;
 select jsonb_build_object('business_name',value->>'business_name','business_address',value->>'business_address','tax_number',value->>'tax_number') into cfg from settings where id=1;
 perform pg_advisory_xact_lock(17092027);
 if p_action in('adjust','reverse') then
  if not(st.role='owner' or st.permissions @> '["bestandskorrektur"]') then raise exception 'FORBIDDEN';end if;
  newid:=(p_value->>'id')::uuid;select * into adj from stock_adjustments where id=newid;if found then return to_jsonb(adj);end if;
  if p_action='reverse' then
   if st.role<>'owner' then raise exception 'FORBIDDEN';end if;
   select * into oldadj from stock_adjustments where id=(p_value->>'reverses_id')::uuid;
   if not found or exists(select 1 from stock_adjustments where reverses_id=oldadj.id) then raise exception 'HINWEIS:Buchung fehlt oder wurde bereits gegengebucht.';end if;
   pid:=oldadj.product_id;units:=-oldadj.delta_units;v_reason:='reversal';
  else
   pid:=p_value->>'product_id';units:=(p_value->>'delta_units')::bigint;v_reason:=p_value->>'reason';
   if v_reason not in('breakage','theft','loss','expiry','gift','personal_use','sample','supplier_return','found','count_error','other') then raise exception 'HINWEIS:Grund auswählen.';end if;
   if units>0 and (st.role<>'owner' or v_reason not in('found','count_error','other')) then raise exception 'HINWEIS:Zugänge werden nur durch den Inhaber als Fund oder Korrektur gebucht.';end if;
  end if;
  v_note:=trim(coalesce(p_value->>'note',''));
  if char_length(v_note)<3 or units=0 or abs(units)>10000000 or (p_value->>'occurred_on')::date>(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Menge, Ereignisdatum und Begründung prüfen.';end if;
  select * into p from products where id=pid for update;
  if not found or p.stock is null then raise exception 'HINWEIS:Zuerst einen bekannten Bestand durch Inventur festlegen.';end if;
  actual:=p.stock::bigint*p.pack_count+p.loose_stock;newunits:=actual+units;
  if newunits<0 then raise exception 'HINWEIS:Die Menge übersteigt den verfügbaren Bestand.';end if;
  insert into stock_adjustments(id,product_id,product_snapshot,before_units,delta_units,after_units,reason,note,reference,occurred_on,actor,actor_name,reverses_id,business_snapshot)
   values(newid,p.id,to_jsonb(p),actual,units,newunits,v_reason,v_note,coalesce(p_value->>'reference',''),(p_value->>'occurred_on')::date,p_actor,who,oldadj.id,cfg) returning * into adj;
  update products set stock=(newunits/p.pack_count)::integer,loose_stock=(newunits%p.pack_count)::integer where id=p.id;
  insert into stock_movements(product_id,delta,delta_units,reason,actor,adjustment_id) values(p.id,(newunits/p.pack_count)::integer-p.stock,units,'Korrektur '||adj.number||': '||v_reason,p_actor,adj.id);
  return to_jsonb(adj);
 end if;
 rid:=(p_value->>'run_id')::uuid;
 if p_action='start' then
  select * into r from inventory_runs where id=rid;if found then return to_jsonb(r);end if;
  if exists(select 1 from inventory_runs where status in('counting','review')) then raise exception 'HINWEIS:Es gibt bereits eine offene Inventur.';end if;
  if trim(p_value->>'title')='' or trim(p_value->>'location')='' or (p_value->>'inventory_date')::date<>(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Inventur mit heutigem Zähltag und Lagerort starten.';end if;
  insert into inventory_runs(id,title,location,inventory_date,created_by,created_name,business_snapshot,notes)
   values(rid,p_value->>'title',p_value->>'location',(p_value->>'inventory_date')::date,p_actor,who,cfg,coalesce(p_value->>'notes','')) returning * into r;
  insert into inventory_lines(run_id,product_id,product_snapshot,cost_net_cents)
   select rid,id,to_jsonb(products),cost_net_cents from products where active or coalesce(stock,0)>0 or loose_stock>0;
  insert into inventory_events(run_id,action,after_value,actor,actor_name) values(rid,'started',to_jsonb(r),p_actor,who);return to_jsonb(r);
 end if;
 select * into r from inventory_runs where id=rid for update;if not found then raise exception 'HINWEIS:Inventur nicht gefunden.';end if;
 if p_action='apply' and r.status='applied' then return to_jsonb(r);end if;
 if r.status in('applied','cancelled') then raise exception 'HINWEIS:Diese Inventur ist abgeschlossen.';end if;
 if p_action in('add','count') and r.status<>'counting' then raise exception 'HINWEIS:Die Inventur befindet sich bereits in Prüfung.';end if;
 if p_action='add' then
  pid:=coalesce(nullif(p_value->>'product_id',''),'inv-'||(p_value->>'id'));
  select * into p from products where id=pid for update;
  if not found then
   if coalesce(p_value->>'barcode','')<>'' and exists(select 1 from products where barcode=p_value->>'barcode') then raise exception 'HINWEIS:Barcode ist bereits vorhanden. Bitte bestehenden Artikel hinzufügen.';end if;
   insert into products(id,sku,name,category,pack_count,volume_ml,price_cents,deposit_cents,deposit_profile,cost_net_cents,active,verified,source,kind)
    values(pid,'INV-'||nextval('inventory_article_number'),p_value->>'name',p_value->>'category',(p_value->>'pack_count')::integer,(p_value->>'volume_ml')::integer,0,null,'custom',null,false,false,'In Inventur angelegt','beverage') returning * into p;
   update products set barcode=coalesce(p_value->>'barcode','') where id=p.id;
  end if;
  insert into inventory_lines(run_id,product_id,product_snapshot,cost_net_cents) values(rid,p.id,to_jsonb(p),p.cost_net_cents) on conflict(run_id,product_id) do nothing;
  update inventory_runs set revision=revision+1 where id=rid;
  insert into inventory_events(run_id,action,after_value,actor,actor_name) values(rid,'article_added',jsonb_build_object('product_id',p.id),p_actor,who);
  return jsonb_build_object('product_id',p.id);
 elsif p_action='count' then
  select * into l from inventory_lines where run_id=rid and id=(p_value->>'line_id')::uuid for update;
  if not found or l.revision<>(p_value->>'revision')::integer then raise exception 'HINWEIS:Zählposition wurde zwischenzeitlich geändert. Bitte neu laden.';end if;
  select * into p from products where id=l.product_id for update;
  if p.stock_version<>(p_value->>'stock_version')::bigint then raise exception 'HINWEIS:Bestand wurde während der Zählung bewegt. Bitte neu laden und Menge erneut prüfen.';end if;
  units:=(p_value->>'packs')::bigint*p.pack_count+(p_value->>'loose')::bigint;cost:=(p_value->>'cost_net_cents')::integer;v_reason:=coalesce(p_value->>'reason','');v_note:=coalesce(p_value->>'note','');
  if units<0 or units>10000000 or (p_value->>'loose')::integer<0 or (p_value->>'loose')::integer>=p.pack_count or (p_value->>'packs')::integer<0 then raise exception 'HINWEIS:Menge oder lose Einheiten prüfen.';end if;
  actual:=p.stock::bigint*p.pack_count+p.loose_stock;
  if actual is null then v_reason:='initial';elsif actual=units then v_reason:='none';
  elsif v_reason not in('breakage','theft','loss','expiry','gift','personal_use','sample','supplier_return','found','count_error','other') then raise exception 'HINWEIS:Für die Differenz bitte einen Grund auswählen.';end if;
  if v_reason='other' and char_length(trim(v_note))<3 then raise exception 'HINWEIS:Sonstigen Grund bitte erläutern.';end if;
  before_row:=to_jsonb(l);
  update inventory_lines set product_snapshot=to_jsonb(p),book_units=actual,counted_units=units,stock_version=p.stock_version,cost_net_cents=cost,reason=v_reason,note=v_note,counted_at=now(),counted_by=p_actor,counted_name=who,revision=revision+1 where id=l.id returning * into l;
  update inventory_runs set revision=revision+1 where id=rid;
  insert into inventory_events(run_id,line_id,action,before_value,after_value,actor,actor_name) values(rid,l.id,'counted',before_row,to_jsonb(l),p_actor,who);return to_jsonb(l);
 elsif p_action in('submit','reopen','cancel','apply') then
  if r.revision<>(p_value->>'revision')::integer then raise exception 'HINWEIS:Inventur wurde geändert. Bitte neu laden und erneut prüfen.';end if;
  if p_action in('reopen','cancel','apply') and st.role<>'owner' then raise exception 'FORBIDDEN';end if;
  before_row:=to_jsonb(r);
  if p_action='submit' then
   if r.status<>'counting' or not exists(select 1 from inventory_lines where run_id=rid) or exists(select 1 from inventory_lines where run_id=rid and counted_units is null) then raise exception 'HINWEIS:Zuerst alle Positionen zählen, auch Nullbestände ausdrücklich erfassen.';end if;
   update inventory_runs set status='review',submitted_at=now(),revision=revision+1 where id=rid returning * into r;
  elsif p_action='reopen' then update inventory_runs set status='counting',revision=revision+1 where id=rid returning * into r;
  elsif p_action='cancel' then update inventory_runs set status='cancelled',revision=revision+1 where id=rid returning * into r;
  else
   if r.status<>'review' or p_value->>'confirmation' is distinct from 'BESTAND ÜBERNEHMEN' then raise exception 'HINWEIS:Übernahme ausdrücklich bestätigen.';end if;
   -- Include any article received/added after this run was started before calling it complete.
   if exists(select 1 from products pr where (pr.active or coalesce(pr.stock,0)>0 or pr.loose_stock>0) and not exists(select 1 from inventory_lines li where li.run_id=rid and li.product_id=pr.id)) then raise exception 'HINWEIS:Neue Artikel fehlen in der Zählliste. Inventur wieder öffnen und ergänzen.';end if;
   if exists(select 1 from inventory_lines where run_id=rid and (counted_units is null or (counted_units>0 and cost_net_cents is null))) then raise exception 'HINWEIS:Zählung oder Netto-Einkaufswert fehlt. Inventur wieder öffnen und ergänzen.';end if;
   for l in select * from inventory_lines where run_id=rid order by product_id for update loop
    select * into p from products where id=l.product_id for update;
    if p.pack_count<>(l.product_snapshot->>'pack_count')::integer or (l.book_units is null and p.stock_version<>l.stock_version) or (l.book_units is not null and p.stock is null) then raise exception 'HINWEIS:Gebinde oder unbekannter Ausgangsbestand wurde verändert. Betroffenen Artikel erneut zählen.';end if;
    actual:=p.stock::bigint*p.pack_count+p.loose_stock;movement:=case when l.book_units is null then 0 else actual-l.book_units end;newunits:=l.counted_units+movement;
    if newunits<0 then raise exception 'HINWEIS:Bewegungen seit Zählung übersteigen den gezählten Bestand. Erneut zählen.';end if;
    update inventory_lines set apply_book_units=actual,movement_since_count=movement,applied_units=newunits where id=l.id;
    update products set stock=(newunits/p.pack_count)::integer,loose_stock=(newunits%p.pack_count)::integer,cost_net_cents=l.cost_net_cents where id=p.id;
    insert into stock_movements(product_id,delta,delta_units,reason,actor,inventory_id) values(p.id,(newunits/p.pack_count)::integer-coalesce(p.stock,0),newunits-coalesce(actual,0),'Inventur '||r.number||': '||l.reason,p_actor,rid);
   end loop;
   update inventory_runs set status='applied',applied_at=now(),applied_by=p_actor,applied_name=who,revision=revision+1 where id=rid returning * into r;
  end if;
  insert into inventory_events(run_id,action,before_value,after_value,actor,actor_name) values(rid,p_action,before_row,to_jsonb(r),p_actor,who);return to_jsonb(r);
 end if;
 raise exception 'HINWEIS:Unbekannte Inventuraktion.';
end;$$;
revoke all on function inventory_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function inventory_command(text,jsonb,uuid) to service_role;

-- Article edits cannot overwrite stock or reinterpret an existing pack balance.
create or replace function save_product(p_value jsonb,p_expected_revision integer,p_actor uuid) returns boolean language plpgsql security definer set search_path=public as $$declare p products;old_stock integer;old_revision integer;old_pack integer;old_loose integer;begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or permissions @> '["artikel"]')) then raise exception 'FORBIDDEN';end if;
 perform pg_advisory_xact_lock(17092027);perform pg_advisory_xact_lock(17092026);select * into p from jsonb_populate_record(null::products,p_value);
 select stock,revision,pack_count,loose_stock into old_stock,old_revision,old_pack,old_loose from products where id=p.id for update;
 if found then if p_expected_revision is null or old_revision<>p_expected_revision then return false;end if;
 if p.stock is distinct from old_stock then raise exception 'HINWEIS:Bestand über Inventur oder Bestandskorrektur ändern.';end if;
 if p.pack_count<>old_pack and (coalesce(old_stock,0)>0 or old_loose>0 or exists(select 1 from inventory_lines l join inventory_runs r on r.id=l.run_id where l.product_id=p.id and r.status in('counting','review'))) then raise exception 'HINWEIS:Gebinde bei vorhandenem Bestand oder laufender Inventur nicht ändern. Neue Artikelvariante anlegen.';end if;
 update products set sku=p.sku,name=p.name,category=p.category,pack_count=p.pack_count,volume_ml=p.volume_ml,price_cents=p.price_cents,source_unit_price_cents=p.source_unit_price_cents,deposit_cents=p.deposit_cents,tax_rate=p.tax_rate,deposit_tax_rate=p.deposit_tax_rate,min_stock=p.min_stock,target_stock=p.target_stock,supplier_id=p.supplier_id,reorder_enabled=p.reorder_enabled,active=p.active,verified=p.verified,barcode=p.barcode,source=p.source,kind=p.kind,group_name=p.group_name,variant=p.variant,image_url=p.image_url,image_source=p.image_source,deposit_profile=p.deposit_profile,data_note=p.data_note where id=p.id;
 else if p.stock is not null then raise exception 'HINWEIS:Anfangsbestand über Inventur erfassen.';end if;p.revision:=0;p.loose_stock:=0;p.stock_version:=0;p.cost_net_cents:=null;insert into products select p.*;end if;
 return true;end;$$;

-- An accepted physical count supersedes earlier demo stock movements. Evidence is retained.
create or replace function reset_setup(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$declare m record;begin
 perform pg_advisory_xact_lock(17092027);
 if exists(select 1 from inventory_runs where status in('counting','review')) then raise exception 'HINWEIS:Offene Inventur vor dem Zurücksetzen abschließen oder abbrechen.';end if;
 if coalesce((select (value->>'live_mode')::boolean from settings where id=1),false) or not exists(select 1 from staff where user_id=p_actor and role='owner' and active) then raise exception 'Forbidden';end if;
 for m in select mov.product_id,sum(mov.delta) delta from stock_movements mov where mov.reason like 'setup:%' and mov.created_at>coalesce((select max(l.counted_at) from inventory_lines l join inventory_runs r on r.id=l.run_id where r.status='applied' and l.product_id=mov.product_id),'-infinity'::timestamptz) group by mov.product_id loop update products set stock=stock-m.delta where id=m.product_id and stock is not null;end loop;
 delete from stock_movements where reason like 'setup:%';delete from mail_outbox where kind in('delivery_document','invoice_document');delete from invoices where mode='setup';delete from deliveries where mode='setup';update orders set delivered='{}',status=case when status in('partial','completed','delivering') then 'confirmed' else status end,eta_start=null,eta_end=null,delivery_date=null,route_position=null;delete from sales where test_mode;delete from closings where test_mode;
 insert into audit_log(table_name,action,actor,details) values('setup','reset',p_actor,'{"reason":"Explicit owner reset of setup transactions"}');end;$$;
