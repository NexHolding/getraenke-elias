-- A single store drawer, with immutable cash movements and daily counts.
-- Existing financial records are neither rewritten nor imported until the first opening.
create table cash_days(
 id uuid primary key default gen_random_uuid(),day date not null,test_mode boolean not null,
 opening_cents bigint not null check(opening_cents>=0),opened_at timestamptz not null default now(),opened_by uuid not null references auth.users,
 closed_at timestamptz,closed_by uuid references auth.users,expected_cents bigint,counted_cents bigint,difference_cents bigint,next_opening_cents bigint,
 closing_note text not null default '',transfer_note text not null default '',unique(day,test_mode)
);
create table cash_entries(
 id uuid primary key default gen_random_uuid(),number bigint generated always as identity unique,
 day_id uuid not null references cash_days,created_at timestamptz not null default now(),
 kind text not null check(kind in('opening','sale','manual','reversal','difference','float_transfer','delivery_transfer')),
 amount_cents bigint not null,balance_cents bigint not null check(balance_cents>=0),
 description text not null,category text not null default '',reference text not null default '',document_date date,
 actor uuid references auth.users,actor_name text not null default '',source_key text unique,original_id uuid unique references cash_entries,
 has_document boolean not null default false
);
create table cash_documents(entry_id uuid primary key references cash_entries,filename text not null,mime text not null check(mime in('application/pdf','image/png','image/jpeg')),base64 text not null,sha256 text not null);
create table cash_commands(id uuid primary key,actor uuid not null references auth.users,payload jsonb not null,result jsonb not null);
create index cash_entries_day on cash_entries(day_id,number);
alter table cash_days enable row level security;alter table cash_entries enable row level security;alter table cash_documents enable row level security;alter table cash_commands enable row level security;
revoke all on cash_days,cash_entries,cash_documents,cash_commands from public,anon,authenticated;
grant select on cash_days,cash_entries,cash_documents to service_role;
create function cash_immutable() returns trigger language plpgsql as $$begin raise exception 'HINWEIS:Kassenbuch ist festgeschrieben. Bitte eine Gegenbuchung erfassen.';end;$$;
create trigger cash_entries_immutable before update or delete on cash_entries for each row execute function cash_immutable();
create trigger cash_documents_immutable before update or delete on cash_documents for each row execute function cash_immutable();
create function cash_day_protect() returns trigger language plpgsql as $$begin
 if TG_OP='DELETE' or OLD.closed_at is not null then raise exception 'HINWEIS:Tageskasse bereits abgeschlossen.';end if;
 if (to_jsonb(NEW)-array['closed_at','closed_by','expected_cents','counted_cents','difference_cents','next_opening_cents','closing_note','transfer_note']) is distinct from (to_jsonb(OLD)-array['closed_at','closed_by','expected_cents','counted_cents','difference_cents','next_opening_cents','closing_note','transfer_note']) then raise exception 'HINWEIS:Anfangsbestand ist festgeschrieben.';end if;return NEW;end;$$;
create trigger cash_days_protect before update or delete on cash_days for each row execute function cash_day_protect();
create function cash_write(p_day uuid,p_kind text,p_amount bigint,p_description text,p_actor uuid,p_category text default '',p_reference text default '',p_document_date date default null,p_source text default null,p_original uuid default null,p_document boolean default false) returns cash_entries language plpgsql security definer set search_path=public as $$declare d cash_days;e cash_entries;b bigint;n text;begin
 perform pg_advisory_xact_lock(17092027);
 select * into d from cash_days where id=p_day for update;
 if not found or d.closed_at is not null then raise exception 'HINWEIS:Bitte eine offene Tageskasse verwenden.';end if;
 select coalesce((select ce.balance_cents from cash_entries ce join cash_days cd on cd.id=ce.day_id where cd.test_mode=d.test_mode order by ce.number desc limit 1),0) into b;
 if b+p_amount<0 then raise exception 'HINWEIS:Nicht genügend Bargeld in der Kasse. Bestand und Einlagen prüfen.';end if;
 select case when lower(email)='global_admin@getraenke-elias.local' then 'Administration' else name end into n from staff where user_id=p_actor;
 insert into cash_entries(day_id,kind,amount_cents,balance_cents,description,actor,actor_name,category,reference,document_date,source_key,original_id,has_document)
 values(p_day,p_kind,p_amount,b+p_amount,p_description,p_actor,coalesce(n,'System'),p_category,p_reference,p_document_date,p_source,p_original,p_document) returning * into e;return e;end;$$;
revoke all on function cash_write(uuid,text,bigint,text,uuid,text,text,date,text,uuid,boolean) from public,anon,authenticated,service_role;
create function cash_sale_entry() returns trigger language plpgsql security definer set search_path=public as $$declare d cash_days;begin
 perform pg_advisory_xact_lock(17092027);
 if not exists(select 1 from cash_days where test_mode=NEW.test_mode) then return NEW;end if;
 select * into d from cash_days where day=(NEW.created_at at time zone 'Europe/Berlin')::date and test_mode=NEW.test_mode;
 if not found or d.closed_at is not null then raise exception 'HINWEIS:Bitte zuerst die Tageskasse öffnen. Nach Kassenabschluss sind keine weiteren Verkäufe an diesem Tag möglich.';end if;
 if NEW.payment='cash' then perform cash_write(d.id,'sale',NEW.total_cents,case when NEW.total_cents<0 then 'Barerstattung / Storno' else 'Barverkauf' end,NEW.actor,'Kassenbon','E-'||NEW.number,d.day,'sale:'||NEW.id);end if;
 return NEW;end;$$;
create trigger cash_sale_entry after insert on sales for each row execute function cash_sale_entry();
-- Never remove underlying demo receipts once they have entered the cash book.
alter function reset_setup(uuid) rename to reset_setup_without_cash_book;
revoke all on function reset_setup_without_cash_book(uuid) from public,anon,authenticated,service_role;
create function reset_setup(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 perform pg_advisory_xact_lock(17092027);
 if exists(select 1 from cash_days) then raise exception 'HINWEIS:Kassenbuch ist eingerichtet. Belege dürfen nicht über die Demo-Rücksetzung entfernt werden.';end if;
 perform reset_setup_without_cash_book(p_actor);end;$$;
revoke all on function reset_setup(uuid) from public,anon,authenticated;grant execute on function reset_setup(uuid) to service_role;
create function cash_book_command(p_value jsonb,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare cmd cash_commands;d cash_days;prev cash_days;e cash_entries;orig cash_entries;payment record;s record;st staff;today date:=(now() at time zone 'Europe/Berlin')::date;test boolean;opening bigint;amount bigint;balance bigint;counted bigint;next_cash bigint;revision bigint;result jsonb;action text:=p_value->>'action';doc jsonb:=p_value->'document';begin
 perform pg_advisory_xact_lock(17092027);
 select * into st from staff where user_id=p_actor and active;
 if not found or (st.role<>'owner' and (st.finance_readonly or not (st.permissions ? 'kasse' or st.permissions ? 'finanzen'))) then raise exception 'FORBIDDEN';end if;
 select * into cmd from cash_commands where id=(p_value->>'request_id')::uuid;
 if found then if cmd.actor is distinct from p_actor or cmd.payload is distinct from p_value then raise exception 'HINWEIS:Vorgangskennung bereits verwendet.';end if;return cmd.result;end if;
 test:=not coalesce((select (value->>'live_mode')::boolean from settings where id=1),false);
 -- The existing TSE activation gate continues to apply to all live cash postings.
 if not test then raise exception 'HINWEIS:Echtbetrieb noch nicht freigegeben.';end if;
 if action='open' then
  if exists(select 1 from cash_days where test_mode=test and (closed_at is null or day>=today)) then raise exception 'HINWEIS:Es besteht bereits eine offene oder heutige Tageskasse. Bitte diese verwenden bzw. abschließen.';end if;
  opening:=(p_value->>'opening_cents')::bigint;
  if opening is null or opening<0 or opening>100000000 then raise exception 'HINWEIS:Anfangsbestand prüfen.';end if;
  select * into prev from cash_days where test_mode=test order by day desc limit 1;
  if prev.id is not null and opening<>prev.next_opening_cents and length(trim(coalesce(p_value->>'note','')))<3 then raise exception 'HINWEIS:Abweichung zum vorgetragenen Anfangsbestand erläutern.';end if;
  insert into cash_days(day,test_mode,opening_cents,opened_by) values(today,test,opening,p_actor) returning * into d;
  perform cash_write(d.id,'opening',opening-coalesce(prev.next_opening_cents,0),'Anfangsbestand bestätigt'||case when prev.id is not null and opening<>prev.next_opening_cents then ': '||(p_value->>'note') else '' end,p_actor,'Vortrag','',today);
  -- On first activation, include already existing same-day sales once.
  for s in select sx.* from sales sx where sx.test_mode=test and sx.payment='cash' and (sx.created_at at time zone 'Europe/Berlin')::date=today order by sx.created_at,sx.number loop
   perform cash_write(d.id,'sale',s.total_cents,'Barbeleg vor Öffnung des Kassenbuchs',s.actor,'Kassenbon','E-'||s.number,today,'sale:'||s.id);
  end loop;
  result:=to_jsonb(d);
 else
  select * into d from cash_days where id=(p_value->>'day_id')::uuid for update;
  if not found or d.test_mode<>test or d.closed_at is not null then raise exception 'HINWEIS:Bitte eine offene Tageskasse verwenden.';end if;
  if action<>'close' and d.day<>today then raise exception 'HINWEIS:Bitte den vorherigen Kassentag zuerst abschließen und die heutige Tageskasse öffnen.';end if;
  if action='movement' then
   amount:=(p_value->>'amount_cents')::bigint;
   if amount is null or amount=0 or abs(amount)>100000000 or length(trim(coalesce(p_value->>'description','')))<3 or length(coalesce(p_value->>'description',''))>1000 or coalesce(p_value->>'category','') not in('Betriebsausgabe','Privatentnahme','Privateinlage','Bank / Tresor','Sonstige Einlage','Sonstige Entnahme') then raise exception 'HINWEIS:Betrag, Zweck und Kategorie prüfen.';end if;
   if (p_value->>'document_date')::date>today then raise exception 'HINWEIS:Belegdatum darf nicht in der Zukunft liegen.';end if;
   if p_value->>'category'='Betriebsausgabe' and amount>0 then raise exception 'HINWEIS:Betriebsausgaben sind Auszahlungen.';end if;
   if p_value->>'category'='Betriebsausgabe' and (doc is null or doc='null'::jsonb) and length(trim(coalesce(p_value->>'reference','')))<1 then raise exception 'HINWEIS:Beleg hochladen oder Papierbeleg-/Eigenbelegnummer angeben.';end if;
   e:=cash_write(d.id,'manual',amount,p_value->>'description',p_actor,p_value->>'category',coalesce(p_value->>'reference',''),(p_value->>'document_date')::date,null,null,doc is not null and doc<>'null'::jsonb);
   if doc is not null and doc<>'null'::jsonb then
    if length(doc->>'base64')>2800000 or length(doc->>'base64')<4 or coalesce(doc->>'sha256','')!~'^[0-9a-f]{64}$' or length(coalesce(doc->>'filename','')) not between 1 and 200 then raise exception 'HINWEIS:Belegdatei prüfen (max. 2 MB).';end if;
    insert into cash_documents values(e.id,doc->>'filename',doc->>'mime',doc->>'base64',doc->>'sha256');
   end if;result:=to_jsonb(e);
  elsif action='reverse' then
   if length(trim(coalesce(p_value->>'note','')))<3 then raise exception 'HINWEIS:Grund der Gegenbuchung angeben.';end if;
   select * into orig from cash_entries where id=(p_value->>'entry_id')::uuid;
   if not found or orig.kind<>'manual' or exists(select 1 from cash_entries where original_id=orig.id) or not exists(select 1 from cash_days where id=orig.day_id and test_mode=test) then raise exception 'HINWEIS:Diese Buchung kann nicht erneut korrigiert werden.';end if;
   e:=cash_write(d.id,'reversal',-orig.amount_cents,'Gegenbuchung: '||(p_value->>'note'),p_actor,orig.category,'KB-'||orig.number,today,null,orig.id);result:=to_jsonb(e);
  elsif action='delivery-transfer' then
   select p.*,i.number invoice_number into payment from invoice_payments p join invoices i on i.id=p.invoice_id where p.id=(p_value->>'payment_id')::uuid and p.method='cash' and (i.mode='setup')=test;
   if not found or exists(select 1 from cash_entries where source_key='payment:'||payment.id) then raise exception 'HINWEIS:Barzahlung fehlt oder wurde bereits übernommen.';end if;
   e:=cash_write(d.id,'delivery_transfer',payment.amount_cents,'Bargeldübergabe Lieferrechnung',p_actor,'Bargeldübertrag','RE-'||payment.invoice_number,(payment.paid_at at time zone 'Europe/Berlin')::date,'payment:'||payment.id);result:=to_jsonb(e);
  elsif action='close' then
   select coalesce(max(number),0) into revision from cash_entries where day_id=d.id;
   if revision is distinct from (p_value->>'revision')::bigint then raise exception 'HINWEIS:Seit der Zählung gab es neue Buchungen. Bitte aktualisieren und Bestand erneut prüfen.';end if;
   select balance_cents into balance from cash_entries where day_id=d.id order by number desc limit 1;
   counted:=(p_value->>'counted_cents')::bigint;next_cash:=(p_value->>'next_opening_cents')::bigint;
   if counted is null or next_cash is null or counted<0 or next_cash<0 or counted>100000000 or next_cash>100000000 or not coalesce((p_value->>'confirmed')::boolean,false) then raise exception 'HINWEIS:Zählbestand und nächsten Anfangsbestand bestätigen.';end if;
   if counted<>next_cash and length(trim(coalesce(p_value->>'transfer_note','')))<3 then raise exception 'HINWEIS:Ziel der Entnahme bzw. Herkunft der Einlage angeben und Bargeld tatsächlich umbuchen.';end if;
   perform cash_write(d.id,'difference',counted-balance,case when counted=balance then 'Kassenprüfung ohne Differenz' else 'Zähldifferenz' end||case when coalesce(p_value->>'note','')<>'' then ': '||(p_value->>'note') else '' end,p_actor,'Kassendifferenz','',d.day);
   if next_cash<>counted then perform cash_write(d.id,'float_transfer',next_cash-counted,case when next_cash<counted then 'Abschöpfung: ' else 'Wechselgeldeinlage: ' end||(p_value->>'transfer_note'),p_actor,'Bank / Tresor','',d.day);end if;
   update cash_days set closed_at=now(),closed_by=p_actor,expected_cents=balance,counted_cents=counted,difference_cents=counted-balance,next_opening_cents=next_cash,closing_note=coalesce(p_value->>'note',''),transfer_note=coalesce(p_value->>'transfer_note','') where id=d.id returning * into d;
   insert into audit_log(table_name,record_id,action,actor,details) values('cash_days',d.id::text,'closed',p_actor,to_jsonb(d));result:=to_jsonb(d);
  else raise exception 'HINWEIS:Unbekannter Kassenvorgang.';end if;
 end if;
 insert into cash_commands values((p_value->>'request_id')::uuid,p_actor,p_value,result);
 return result;
end;$$;
revoke all on function cash_book_command(jsonb,uuid) from public,anon,authenticated;
grant execute on function cash_book_command(jsonb,uuid) to service_role;
-- Setup receipts may otherwise be editable; linked cash-book evidence must remain stable.
create function cash_source_protect() returns trigger language plpgsql security definer set search_path=public as $$begin
 if exists(select 1 from cash_entries where source_key=case when TG_TABLE_NAME='sales' then 'sale:' else 'payment:' end||OLD.id) then raise exception 'HINWEIS:Dieser Beleg ist im Kassenbuch dokumentiert und darf nicht verändert oder gelöscht werden.';end if;
 if TG_OP='DELETE' then return OLD;end if;return NEW;end;$$;
create trigger cash_source_protect before update or delete on sales for each row execute function cash_source_protect();
create trigger cash_payment_source_protect before update or delete on invoice_payments for each row execute function cash_source_protect();
