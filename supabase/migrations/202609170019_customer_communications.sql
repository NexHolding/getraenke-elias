-- Private customer correspondence, independent of the operational outbox.
create table public.customer_communications (
 id uuid primary key default gen_random_uuid(),
 source_key text not null unique,
 customer_id uuid references public.customers(id) on delete set null,
 auth_user_id uuid,
 kind text not null,
 recipient text not null,
 sender text not null default '',
 subject text not null,
 body text not null,
 status text not null default 'pending' check(status in('pending','sending','sent','failed','uncertain')),
 error text,
 provider_message_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 archived_at timestamptz not null default now(),
 legacy boolean not null default false
);
create index customer_communications_customer_date on public.customer_communications(customer_id,created_at desc,id);
create index customer_communications_auth_user on public.customer_communications(auth_user_id);
create table public.communication_attachments (
 id uuid primary key default gen_random_uuid(),
 communication_id uuid not null references public.customer_communications(id) on delete cascade,
 filename text not null,
 content_type text not null check(content_type='application/pdf'),
 size_bytes integer not null check(size_bytes>0 and size_bytes<=10000000),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 content_base64 text not null,
 created_at timestamptz not null default now(),
 unique(communication_id,filename)
);
alter table public.customer_communications enable row level security;
alter table public.communication_attachments enable row level security;
revoke all on public.customer_communications,public.communication_attachments from anon,authenticated;
grant all on public.customer_communications,public.communication_attachments to service_role;

create function public.archive_customer_mail() returns trigger language plpgsql security definer set search_path=public as $$
declare cid uuid;
begin
 if NEW.kind not in ('order_ack','delivery_document','invoice_document') then return NEW;end if;
 if NEW.kind='order_ack' then select customer_id into cid from orders where id=NEW.reference_id;
 elsif NEW.kind='delivery_document' then select customer_id into cid from deliveries where id=NEW.reference_id;
 else select customer_id into cid from invoices where id=NEW.reference_id;end if;
 if cid is null then select id into cid from customers where lower(email)=lower(NEW.recipient) limit 1;end if;
 insert into customer_communications(source_key,customer_id,kind,recipient,subject,body,status,error,created_at,sent_at)
 values('outbox:'||NEW.id,cid,NEW.kind,NEW.recipient,NEW.subject,NEW.body,NEW.status,NEW.error,NEW.created_at,NEW.sent_at)
 on conflict(source_key) do update set status=excluded.status,error=excluded.error,sent_at=excluded.sent_at;
 return NEW;
end;$$;
revoke all on function public.archive_customer_mail() from public,anon,authenticated;
create trigger archive_customer_mail after insert or update of status,sent_at,error on public.mail_outbox for each row execute function public.archive_customer_mail();

-- Historic mail is identified as such: attachments were not preserved previously.
insert into customer_communications(source_key,customer_id,kind,recipient,subject,body,status,error,created_at,sent_at,legacy)
select 'outbox:'||m.id,c.id,m.kind,m.recipient,m.subject,m.body,m.status,m.error,m.created_at,m.sent_at,true
from mail_outbox m left join customers c on lower(c.email)=lower(m.recipient)
where m.kind in('order_ack','delivery_document','invoice_document');

create function public.link_customer_communications() returns trigger language plpgsql security definer set search_path=public as $$begin
 update customer_communications set customer_id=NEW.id
 where customer_id is null and lower(recipient)=lower(NEW.email)
 and (auth_user_id is null or auth_user_id=NEW.user_id);
 return NEW;
end;$$;
revoke all on function public.link_customer_communications() from public,anon,authenticated;
create trigger link_customer_communications after insert or update of user_id,email on public.customers for each row execute function public.link_customer_communications();

create function public.protect_communication_content() returns trigger language plpgsql set search_path=public as $$begin
 if row(NEW.source_key,NEW.kind,NEW.recipient,NEW.subject,NEW.body,NEW.created_at,NEW.auth_user_id)
 is distinct from row(OLD.source_key,OLD.kind,OLD.recipient,OLD.subject,OLD.body,OLD.created_at,OLD.auth_user_id)
 then raise exception 'Archived correspondence content is immutable';end if;
 return NEW;
end;$$;
create trigger protect_communication_content before update on public.customer_communications for each row execute function public.protect_communication_content();
create function public.protect_communication_attachment() returns trigger language plpgsql as $$begin raise exception 'Archived attachment is immutable';end;$$;
create trigger protect_communication_attachment before update on public.communication_attachments for each row execute function public.protect_communication_attachment();

-- Auth hooks must acknowledge quickly; tokens are encrypted until the worker sends them.
create table public.auth_mail_dispatch (
 communication_id uuid primary key references public.customer_communications(id) on delete cascade,
 encrypted_payload text not null,
 expires_at timestamptz not null,
 claimed_at timestamptz
);
alter table public.auth_mail_dispatch enable row level security;
revoke all on public.auth_mail_dispatch from anon,authenticated;
grant all on public.auth_mail_dispatch to service_role;
create function public.queue_auth_mail(p_source text,p_user uuid,p_recipient text,p_kind text,p_subject text,p_body text,p_secret text)
returns uuid language plpgsql security definer set search_path=public as $$declare cid uuid;mid uuid;begin
 select id into mid from customer_communications where source_key=p_source;
 if mid is not null then return mid;end if;
 select id into cid from customers where lower(email)=lower(p_recipient) and (user_id is null or user_id=p_user) limit 1;
 insert into customer_communications(source_key,customer_id,auth_user_id,kind,recipient,subject,body)
 values(p_source,cid,p_user,p_kind,p_recipient,p_subject,p_body)
 on conflict(source_key) do nothing returning id into mid;
 if mid is null then select id into mid from customer_communications where source_key=p_source;return mid;end if;
 insert into auth_mail_dispatch(communication_id,encrypted_payload,expires_at) values(mid,p_secret,now()+interval '55 minutes');
 return mid;
end;$$;
create function public.claim_auth_mail(p_id uuid default null) returns setof public.auth_mail_dispatch
language plpgsql security definer set search_path=public as $$begin
 update customer_communications m set status='failed',error='Sicherheitslink abgelaufen. Bitte eine neue E-Mail anfordern.'
 from auth_mail_dispatch q where q.communication_id=m.id and q.expires_at<now() and m.status='pending';
 update customer_communications m set status='uncertain',error='Versand unterbrochen. Vor erneutem Versand prüfen.'
 from auth_mail_dispatch q where q.communication_id=m.id and q.claimed_at<now()-interval '2 minutes' and m.status='sending';
 delete from auth_mail_dispatch q using customer_communications m where q.communication_id=m.id and m.status in('sent','failed','uncertain');
 return query with picked as (
 select q.communication_id from auth_mail_dispatch q join customer_communications m on m.id=q.communication_id
 where m.status='pending' and q.claimed_at is null and q.expires_at>now() and (p_id is null or q.communication_id=p_id)
 order by m.created_at limit 5 for update of q skip locked
 ), marked as (
 update customer_communications m set status='sending' from picked p where m.id=p.communication_id returning m.id
 ) update auth_mail_dispatch q set claimed_at=now() from marked m where q.communication_id=m.id returning q.*;
end;$$;
revoke all on function public.queue_auth_mail(text,uuid,text,text,text,text,text), public.claim_auth_mail(uuid) from public,anon,authenticated;
grant execute on function public.queue_auth_mail(text,uuid,text,text,text,text,text), public.claim_auth_mail(uuid) to service_role;
