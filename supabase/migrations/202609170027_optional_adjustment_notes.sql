-- Optional supplementary notes for stock adjustments. Required reason and immutable stock evidence remain unchanged.
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
   if v_reason is null or v_reason not in('breakage','theft','loss','expiry','gift','personal_use','sample','supplier_return','found','count_error','other') then raise exception 'HINWEIS:Grund auswählen.';end if;
   if units>0 and (st.role<>'owner' or v_reason not in('found','count_error','other')) then raise exception 'HINWEIS:Zugänge werden nur durch den Inhaber als Fund oder Korrektur gebucht.';end if;
  end if;
  v_note:=trim(coalesce(p_value->>'note',''));
  if units is null or units=0 or abs(units)>10000000 or nullif(p_value->>'occurred_on','') is null or (p_value->>'occurred_on')::date>(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Menge und Ereignisdatum prüfen.';end if;
  if char_length(v_note)>1500 then raise exception 'HINWEIS:Begründung auf 1500 Zeichen kürzen.';end if;
  if p_action='reverse' and char_length(v_note)<3 then raise exception 'HINWEIS:Gegenbuchung bitte begründen.';end if;
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
