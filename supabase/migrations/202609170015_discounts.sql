-- Authorized by owner: enable discounts for all existing employees, preserving other rights.
update public.staff
set permissions = coalesce(permissions, '[]'::jsonb) || '["rabatt"]'::jsonb
where role = 'staff' and not coalesce(permissions, '[]'::jsonb) @> '["rabatt"]'::jsonb;

-- Same RPC signature: old clients keep working during rollout. discount_percent in
-- settings is now the suggested cart rate, not a ceiling. Authorized rates: 0–100%.
create or replace function public.save_sale(
  p_id uuid, p_lines jsonb, p_payment text, p_actor uuid,
  p_returns jsonb default '[]', p_discount integer default 0
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  l jsonb; p products; s sales; st staff; cfg jsonb;
  items jsonb := '[]'; q integer; unit integer; rate integer; line_rate integer;
  reason text; scope text; g integer := 0; n integer := 0; d integer := 0;
  a integer; b integer;
begin
  perform pg_advisory_xact_lock(17092027);
  select * into st from staff where user_id=p_actor;
  if not found or not st.active or not (st.role='owner' or st.permissions @> '["kasse"]') then
    raise exception 'FORBIDDEN';
  end if;
  select * into s from sales where id=p_id;
  if found then
    if s.actor is distinct from p_actor then raise exception 'FORBIDDEN'; end if;
    return to_jsonb(s);
  end if;
  select value into cfg from settings where id=1;
  if coalesce((cfg->>'live_mode')::boolean,false) then raise exception 'TSE adapter required'; end if;
  if p_discount is null or p_discount<0 or p_discount>100 then raise exception 'Discount invalid'; end if;
  if p_discount>0 and st.role<>'owner' and not st.permissions @> '["rabatt"]' then raise exception 'Discount forbidden'; end if;
  if p_payment is null or p_payment not in('cash','card') then raise exception 'Payment invalid'; end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>200
    or p_returns is null or jsonb_typeof(p_returns)<>'array' or jsonb_array_length(p_returns)>11 then
    raise exception 'Invalid items';
  end if;
  if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct x->>'id') from jsonb_array_elements(p_lines)x) then
    raise exception 'Duplicate article';
  end if;
  for l in select value from jsonb_array_elements(p_lines) order by value->>'id' loop
    select * into p from products where id=l->>'id' and active for update;
    if not found or p.deposit_cents is null then raise exception 'Article unavailable'; end if;
    q:=(l->>'quantity')::integer;
    if q is null or q<1 or q>1000 then raise exception 'Quantity invalid'; end if;
    line_rate:=coalesce((l->>'discount_percent')::integer,0);
    if line_rate<0 or line_rate>100 then raise exception 'Discount invalid'; end if;
    if p_discount>0 and line_rate>0 then raise exception 'Combined discounts forbidden'; end if;
    rate:=case when p_discount>0 then p_discount else line_rate end;
    if rate>0 and st.role<>'owner' and not st.permissions @> '["rabatt"]' then raise exception 'Discount forbidden'; end if;
    reason:=case when rate=0 then '' else coalesce(nullif(l->>'discount_reason',''),'Rabatt') end;
    if reason not in ('','Rabatt','Kurzes Mindesthaltbarkeitsdatum','Beschädigte Verpackung','Aktion','Kulanz','Mengenrabatt','Sonstiger Preisnachlass') then
      raise exception 'Discount reason invalid';
    end if;
    scope:=case when p_discount>0 then 'cart' when line_rate>0 then 'item' else 'none' end;
    if p.stock is not null and p.stock<q then raise exception 'Insufficient stock'; end if;
    unit:=round(p.price_cents::numeric*(100-rate)/100);
    a:=q*unit; b:=q*p.deposit_cents;
    g:=g+a+b;
    n:=n+round(a*100.0/(100+p.tax_rate))+round(b*100.0/(100+p.deposit_tax_rate));
    d:=d+b;
    items:=items||jsonb_build_array(jsonb_build_object(
      'id',p.id,'name',p.name,'quantity',q,'price_cents',unit,
      'original_price_cents',p.price_cents,'discount_percent',rate,
      'discount_reason',reason,'discount_scope',scope,
      'deposit_cents',p.deposit_cents,'tax_rate',p.tax_rate,'deposit_tax_rate',p.deposit_tax_rate));
    if p.stock is not null then
      update products set stock=stock-q where id=p.id;
      insert into stock_movements(product_id,delta,reason,actor) values(p.id,-q,'setup:sale:'||p_id,p_actor);
    end if;
  end loop;
  for l in select value from jsonb_array_elements(p_returns) loop
    q:=(l->>'quantity')::integer; b:=(l->>'deposit_cents')::integer;
    if q is null or b is null or q<1 or q>1000 or b not in(8,15,25,150,240,285,330,310,342,450,510) then raise exception 'Return invalid'; end if;
    d:=d-q*b; g:=g-q*b; n:=n-round(q*b*100.0/119);
    items:=items||jsonb_build_array(jsonb_build_object('id','return-'||b,'name','Pfandrücknahme','quantity',-q,'price_cents',0,'deposit_cents',b,'tax_rate',19,'deposit_tax_rate',19));
  end loop;
  if jsonb_array_length(items)=0 then raise exception 'Empty sale'; end if;
  insert into sales(id,items,total_cents,net_cents,tax_cents,deposit_cents,payment,actor,discount_percent,actor_name)
    values(p_id,items,g,n,g-n,d,p_payment,p_actor,p_discount,
      case when lower(st.email)='global_admin@getraenke-elias.local' then 'Administration' else st.name end)
    returning * into s;
  return to_jsonb(s);
end;
$$;
revoke all on function public.save_sale(uuid,jsonb,text,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.save_sale(uuid,jsonb,text,uuid,jsonb,integer) to service_role;
