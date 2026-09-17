create table public.mail_outbox(id uuid primary key default gen_random_uuid(),kind text not null,reference_id uuid,recipient text not null,subject text not null,body text not null,status text not null default 'pending' check(status in('pending','sending','sent','failed','uncertain')),error text,created_at timestamptz not null default now(),sent_at timestamptz,unique(kind,reference_id));
alter table public.mail_outbox enable row level security;
alter table public.purchases drop constraint purchases_status_check;
alter table public.purchases add constraint purchases_status_check check(status in('draft','queued','sent','received','cancelled'));
create or replace function public.queue_purchase_mail() returns trigger language plpgsql security definer set search_path=public as $$declare s suppliers;cfg jsonb;body text;begin
 select * into s from suppliers where id=NEW.supplier_id;select value into cfg from settings where id=1;
 if s.is_demo or not s.auto_send or s.email='' or not coalesce((cfg->>'smtp_enabled')::boolean,false) then return NEW;end if;
 select string_agg((i->>'quantity')||' x '||(i->>'name'),E'\n') into body from jsonb_array_elements(NEW.items) i;
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('purchase',NEW.id,s.email,'Getränke Elias – Bestellung '||left(NEW.id::text,8),'Guten Tag,'||E'\n\n'||'bitte liefern Sie folgende Artikel an Getränkeshop Elias, Wartbergstraße 3, 74076 Heilbronn:'||E'\n\n'||body||E'\n\n'||'Bitte bestätigen Sie diese Bestellung und den Liefertermin.'||E'\n\n'||'Vielen Dank, Getränkeshop Elias') on conflict do nothing;
 update purchases set status='queued' where id=NEW.id;return NEW;end;$$;
create trigger purchase_mail after insert on public.purchases for each row execute function public.queue_purchase_mail();
create or replace function public.queue_order_mail() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;begin
 select value into cfg from settings where id=1;
 if coalesce((cfg->>'smtp_enabled')::boolean,false) and coalesce(cfg->>'smtp_from','')<>'' then
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_notification',NEW.id,cfg->>'smtp_from','Neue Elias-Lieferanfrage EL-'||NEW.number,'Eine neue Lieferanfrage ist eingegangen. Bitte im geschützten Elias-CRM prüfen. Die Anfrage ist noch keine bestätigte Bestellung.');
 insert into mail_outbox(kind,reference_id,recipient,subject,body) values('order_ack',NEW.id,NEW.email,'Deine Anfrage bei Getränke Elias – EL-'||NEW.number,'Hallo '||NEW.customer_name||','||E'\n\n'||'vielen Dank für deine Getränkeauswahl. Deine unverbindliche Anfrage ist bei uns eingegangen. Wir bestätigen Verfügbarkeit, aktuelle Preise, Pfand und Liefertermin persönlich. Diese Nachricht ist noch keine Annahme einer Bestellung.'||E'\n\n'||'Dein Getränkeshop Elias'||E'\n'||'Wartbergstraße 3 · 74076 Heilbronn'||E'\n'||'07131 / 797 52 25');end if;return NEW;end;$$;
create trigger order_mail after insert on public.orders for each row execute function public.queue_order_mail();
create or replace function public.claim_mail() returns setof public.mail_outbox language plpgsql security definer set search_path=public as $$begin
 update mail_outbox set status='uncertain',error='Worker unterbrochen; Zustellung vor erneutem Versand prüfen.' where status='sending' and created_at<now()-interval '15 minutes';
 return query update mail_outbox set status='sending' where id in(select id from mail_outbox where status='pending' order by created_at limit 5 for update skip locked) returning *;end;$$;
revoke all on function public.claim_mail() from public,anon,authenticated;grant execute on function public.claim_mail() to service_role;
update settings set value=value||'{"smtp_enabled":false}'::jsonb where id=1;
-- Pending queued messages must count as open supply.
create or replace function public.generate_reorders() returns integer language plpgsql security definer set search_path=public as $$declare p record;s record;pending integer;q integer;rows jsonb;n integer:=0;begin
 perform pg_advisory_xact_lock(17092026);
 if not coalesce((select (value->>'auto_reorder')::boolean from settings where id=1),false) then return 0;end if;
 for s in select * from suppliers loop rows:='[]'::jsonb;
  for p in select * from products where supplier_id=s.id and active and reorder_enabled and stock is not null and stock<min_stock order by id for update loop
   select coalesce(sum((i->>'quantity')::integer),0) into pending from purchases o cross join lateral jsonb_array_elements(o.items) i where o.status in('draft','queued','sent') and i->>'id'=p.id;
   q:=greatest(0,p.target_stock-p.stock-pending);
   if q>0 then rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',q));end if;
  end loop;
  if jsonb_array_length(rows)>0 then insert into purchases(supplier_id,items) values(s.id,rows);n:=n+1;end if;
 end loop;return n;end;$$;
