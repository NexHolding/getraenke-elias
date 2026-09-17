-- Extra supplier demand is deliberately excluded from regular automatic pending quantities.
alter table purchases add column source text not null default 'automatic' check(source in('automatic','manual')),
 add column request_id uuid unique, add column created_by uuid references auth.users(id),
 add column requested_date date, add column reference text not null default '', add column notes text not null default '',
 add column dispatch_method text check(dispatch_method in('email','external'));
create trigger purchases_audit after insert or update on purchases for each row execute function audit_change();

create function purchase_staff_access(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 if not exists(select 1 from staff where user_id=p_actor and active and (role='owner' or (not finance_readonly and permissions ? 'einkauf'))) then raise exception 'FORBIDDEN';end if;
end;$$;
create function create_manual_purchase(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare p purchases;s suppliers;a products;l jsonb;rows jsonb:='[]';request uuid;q integer;due date;begin
 perform purchase_staff_access(p_actor);perform pg_advisory_xact_lock(17092026);
 request:=(p_value->>'request_id')::uuid;if request is null then raise exception 'HINWEIS:Bestellkennung fehlt.';end if;
 select * into p from purchases where request_id=request;
 if found then if p.created_by is distinct from p_actor then raise exception 'FORBIDDEN';end if;return to_jsonb(p);end if;
 select * into s from suppliers where id=p_value->>'supplier_id' for share;
 if not found then raise exception 'HINWEIS:Bitte einen vorhandenen Lieferanten auswählen.';end if;
 if p_value->'items' is null or jsonb_typeof(p_value->'items')<>'array' then raise exception 'HINWEIS:Bitte Artikel auswählen.';end if;
 if jsonb_array_length(p_value->'items') not between 1 and 200 or (select count(distinct value->>'id') from jsonb_array_elements(p_value->'items'))<>jsonb_array_length(p_value->'items') then raise exception 'HINWEIS:Bitte mindestens einen Artikel wählen, ohne doppelte Positionen.';end if;
 due:=(p_value->>'requested_date')::date;
 if due<(now() at time zone 'Europe/Berlin')::date then raise exception 'HINWEIS:Der Wunschtermin darf nicht in der Vergangenheit liegen.';end if;
 if length(coalesce(p_value->>'reference',''))>200 or length(coalesce(p_value->>'notes',''))>1000 then raise exception 'HINWEIS:Bezug oder Hinweis ist zu lang.';end if;
 for l in select value from jsonb_array_elements(p_value->'items') loop
  if coalesce(l->>'quantity','') !~ '^[0-9]+$' then raise exception 'HINWEIS:Bitte ganze Gebindemengen eingeben.';end if;
  q:=(l->>'quantity')::integer;if q not between 1 and 100000 then raise exception 'HINWEIS:Die Menge muss zwischen 1 und 100.000 liegen.';end if;
  select * into a from products where id=l->>'id' and active for share;
  if not found then raise exception 'HINWEIS:Ein Artikel ist nicht mehr aktiv. Bitte Auswahl aktualisieren.';end if;
  if a.supplier_id is not null and a.supplier_id<>s.id then raise exception 'HINWEIS:Ein Artikel ist einem anderen Lieferanten zugeordnet.';end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('id',a.id,'sku',a.sku,'name',a.name,'quantity',q,'pack_count',a.pack_count,'volume_ml',a.volume_ml));
 end loop;
 insert into purchases(supplier_id,source,request_id,created_by,requested_date,reference,notes,items)
 values(s.id,'manual',request,p_actor,due,coalesce(p_value->>'reference',''),coalesce(p_value->>'notes',''),rows) returning * into p;
 insert into audit_log(table_name,record_id,action,actor,details) values('purchases',p.id::text,'manual_created',p_actor,jsonb_build_object('supplier_id',s.id,'source','manual'));
 return to_jsonb(p);
end;$$;

create function manage_purchase(p_id uuid,p_action text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare p purchases;s suppliers;cfg jsonb;secret text;lines text;body text;begin
 perform purchase_staff_access(p_actor);select * into p from purchases where id=p_id for update;
 if not found then raise exception 'HINWEIS:Bestellung nicht gefunden.';end if;
 if (p_action='email' and p.dispatch_method='email' and p.status in('queued','sent','received')) or (p_action='external' and p.dispatch_method='external' and p.status in('sent','received')) or (p_action='cancel' and p.status='cancelled') then return to_jsonb(p);end if;
 if p.status<>'draft' then raise exception 'HINWEIS:Diese Bestellung ist kein Entwurf mehr. Bitte die Anzeige aktualisieren.';end if;
 if p_action='cancel' then
  update purchases set status='cancelled' where id=p_id returning * into p;
 elsif p_action='external' then
  update purchases set status='sent',dispatch_method='external' where id=p_id returning * into p;
 elsif p_action='email' then
  select * into s from suppliers where id=p.supplier_id for share;
  select value,smtp_secret into cfg,secret from settings where id=1;
  if not coalesce((cfg->>'smtp_enabled')::boolean,false) or coalesce(cfg->>'smtp_host','')='' or coalesce(cfg->>'smtp_from','')='' or coalesce(cfg->>'smtp_user','')='' or coalesce(secret,'')='' then raise exception 'HINWEIS:Bitte zuerst den E-Mail-Server unter Einstellungen → Schnittstellen vollständig einrichten.';end if;
  if trim(s.email)='' or s.email not like '%@%.%' then raise exception 'HINWEIS:Bitte zuerst eine Bestell-E-Mail-Adresse beim Lieferanten hinterlegen.';end if;
  if p.source='automatic' and not s.auto_send then raise exception 'HINWEIS:Für automatische Bestellungen muss der E-Mail-Versand beim Lieferanten freigegeben sein.';end if;
  select string_agg((i->>'quantity')||' × '||(i->>'name')||coalesce(' · '||(i->>'sku'),'')||case when i ? 'pack_count' then ' · '||(i->>'pack_count')||' × '||to_char((i->>'volume_ml')::numeric/1000,'FM999990D999')||' l' else '' end,E'\n') into lines from jsonb_array_elements(p.items) i;
  body:='Guten Tag,'||E'\n\n'||case when p.source='manual' then 'bitte liefern Sie zusätzlich zu unseren regulären Bestellungen:' else 'bitte liefern Sie:' end||E'\n\n'||lines||E'\n\nLieferadresse: '||coalesce(cfg->>'business_name','Getränkeshop Elias')||', '||coalesce(cfg->>'business_address','Wartbergstraße 3 · 74076 Heilbronn')||coalesce(E'\nWunschtermin: '||to_char(p.requested_date,'DD.MM.YYYY'),'')||case when p.reference<>'' then E'\nBezug: '||p.reference else '' end||case when p.notes<>'' then E'\nHinweise: '||p.notes else '' end||E'\n\nBitte bestätigen Sie die Bestellung und den Liefertermin.\nVielen Dank, Getränkeshop Elias';
  insert into mail_outbox(kind,reference_id,recipient,subject,body) values('purchase',p.id,s.email,'Getränke Elias – '||case when p.source='manual' then 'Zusatzbestellung ' else 'Bestellung ' end||left(p.id::text,8),body);
  update purchases set status='queued',dispatch_method='email' where id=p_id returning * into p;
 else raise exception 'HINWEIS:Ungültige Aktion.';end if;
 insert into audit_log(table_name,record_id,action,actor,details) values('purchases',p.id::text,'purchase_'||p_action,p_actor,jsonb_build_object('source',p.source));
 return to_jsonb(p);
end;$$;

-- Manual creation never inherits the supplier's automatic dispatch switch.
create or replace function queue_purchase_mail() returns trigger language plpgsql security definer set search_path=public as $$declare s suppliers;b text;begin
 if NEW.source='manual' then return NEW;end if;
 select * into s from suppliers where id=NEW.supplier_id;
 if not s.auto_send or s.email='' then return NEW;end if;
 select string_agg((i->>'quantity')||' x '||(i->>'name'),E'\n') into b from jsonb_array_elements(NEW.items) i;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('purchase',NEW.id,s.email,'Getränke Elias – Sammelbestellung '||left(NEW.id::text,8),'Bitte liefern Sie an Getränkeshop Elias, Wartbergstraße 3, 74076 Heilbronn:'||E'\n\n'||b||E'\n\nBitte bestätigen Sie Bestellung und Liefertermin.') on conflict do nothing;
 update purchases set status='queued',dispatch_method='email' where id=NEW.id;return NEW;end;$$;

create or replace function generate_reorders() returns integer language plpgsql security definer set search_path=public as $$declare p record;s record;pending integer;q integer;rows jsonb;n integer:=0;cfg jsonb;local_now timestamp;slot_key text;begin
 perform pg_advisory_xact_lock(17092026);select value into cfg from settings where id=1;
 if not coalesce((cfg->>'auto_reorder')::boolean,false) then return 0;end if;
 local_now:=now() at time zone 'Europe/Berlin';
 if not (cfg->'reorder_days' @> to_jsonb(array[extract(isodow from local_now)::integer])) or local_now::time<(cfg->>'reorder_time')::time then return 0;end if;
 if mod(floor((local_now::date-(cfg->>'reorder_anchor')::date)/7.0)::integer,greatest(1,(cfg->>'reorder_weeks')::integer))<>0 then return 0;end if;
 slot_key:=to_char(local_now,'YYYY-MM-DD');
 insert into automation_runs(kind,slot) values('reorder',slot_key) on conflict do nothing;if not found then return 0;end if;
 for s in select * from suppliers loop rows:='[]';
 for p in select * from products where supplier_id=s.id and active and reorder_enabled and stock is not null and stock<min_stock order by id for update loop
  select coalesce(sum((i->>'quantity')::integer),0) into pending from purchases o cross join lateral jsonb_array_elements(o.items) i where o.source='automatic' and o.status in('draft','queued','sent') and i->>'id'=p.id;
  q:=greatest(0,p.target_stock-p.stock-pending);if q>0 then rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q));end if;
 end loop;if jsonb_array_length(rows)>0 then insert into purchases(supplier_id,items,source) values(s.id,rows,'automatic');n:=n+1;end if;end loop;return n;end;$$;
revoke all on function purchase_staff_access(uuid),create_manual_purchase(jsonb,uuid),manage_purchase(uuid,text,uuid) from public,anon,authenticated;
grant execute on function create_manual_purchase(jsonb,uuid),manage_purchase(uuid,text,uuid) to service_role;
