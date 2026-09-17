-- Persist delivery-time facts; later profile changes or subsequent partial deliveries must not rewrite signed PDFs.
alter table deliveries add column order_snapshot jsonb not null default '{}',add column business_snapshot jsonb not null default '{}';
alter table invoices add column business_snapshot jsonb not null default '{}',add column paid_at timestamptz,add column paid_by uuid references auth.users(id);
create or replace function delivery_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare o jsonb;cfg jsonb;l jsonb;delivered jsonb;begin
 if TG_OP='UPDATE' and OLD.status='delivered' then raise exception 'Signed delivery is immutable';end if;
 select to_jsonb(x) into o from orders x where id=NEW.order_id;select value into cfg from settings where id=1;
 if NEW.status='delivered' then delivered:=o->'delivered';for l in select value from jsonb_array_elements(NEW.items) loop delivered:=jsonb_set(delivered,array[l->>'id'],to_jsonb(coalesce((delivered->>(l->>'id'))::integer,0)+(l->>'quantity')::integer));end loop;o:=jsonb_set(o,'{delivered}',delivered);end if;
 NEW.order_snapshot:=o;NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number');return NEW;end;$$;
create trigger deliveries_snapshot before insert or update on deliveries for each row execute function delivery_snapshot();
create or replace function invoice_snapshot() returns trigger language plpgsql security definer set search_path=public as $$declare cfg jsonb;begin
 if TG_OP='UPDATE' and (to_jsonb(NEW)-array['status','paid_at','paid_by']) is distinct from (to_jsonb(OLD)-array['status','paid_at','paid_by']) then raise exception 'Invoice content is immutable';end if;
 if TG_OP='INSERT' then select value into cfg from settings where id=1;NEW.business_snapshot:=jsonb_build_object('business_name',cfg->>'business_name','business_address',cfg->>'business_address','tax_number',cfg->>'tax_number');end if;return NEW;end;$$;
create trigger invoices_snapshot before insert or update on invoices for each row execute function invoice_snapshot();
