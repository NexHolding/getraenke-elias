-- Receipt output is independent of booking. No changes to balances, VAT or TSE mode.
create table public.receipt_documents (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  pdf_base64 text not null check(length(pdf_base64) between 100 and 8000000),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create table public.receipt_workflows (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  stage text not null default 'pending' check(stage in ('pending','digital','done')),
  medium text check(medium in ('paper','digital')),
  output_method text check(output_method in ('epson','manual_pdf','digital')),
  consent_at timestamptz,
  public_token text unique check(public_token ~ '^[a-f0-9]{64}$'),
  share_expires_at timestamptz,
  offered_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.receipt_print_jobs (
  id uuid primary key,
  sale_id uuid not null references public.sales(id) on delete cascade,
  actor uuid not null references auth.users(id),
  status text not null default 'sending' check(status in ('sending','confirmed','failed','unknown')),
  copy boolean not null default false,
  detail text not null default '',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index receipt_print_jobs_sale_idx on public.receipt_print_jobs(sale_id,created_at desc);
create index receipt_workflows_pending_idx on public.receipt_workflows(created_at) where stage <> 'done';
alter table public.receipt_documents enable row level security;
alter table public.receipt_workflows enable row level security;
alter table public.receipt_print_jobs enable row level security;
revoke all on public.receipt_documents,public.receipt_workflows,public.receipt_print_jobs from anon,authenticated;
grant all on public.receipt_documents,public.receipt_workflows,public.receipt_print_jobs to service_role;
create function public.protect_receipt_document() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' or pg_trigger_depth()<=1 then raise exception 'Receipt archive is immutable'; end if;
  return OLD;
end $$;
create trigger receipt_document_immutable before update or delete on public.receipt_documents for each row execute function public.protect_receipt_document();
create function public.new_receipt_workflow() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into receipt_workflows(sale_id) values(NEW.id);
  return NEW;
end $$;
create trigger sales_receipt_workflow after insert on public.sales for each row execute function public.new_receipt_workflow();
create function public.receipt_command(p_sale uuid,p_actor uuid,p_action text,p_value jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare s sales; st staff; w receipt_workflows; j receipt_print_jobs; prior boolean; jid uuid; state text;
begin
  select * into st from staff where user_id=p_actor;
  if not found or not st.active or not(st.role='owner' or st.permissions ?| array['kasse','finanzen']) then raise exception 'FORBIDDEN'; end if;
  select * into s from sales where id=p_sale;
  if not found or not(s.actor=p_actor or st.role='owner' or st.permissions @> '["finanzen"]') then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from receipt_documents where sale_id=p_sale) then raise exception 'HINWEIS:Bitte zuerst den Beleg archivieren.'; end if;
  insert into receipt_workflows(sale_id) values(p_sale) on conflict do nothing;
  select * into w from receipt_workflows where sale_id=p_sale for update;
  insert into audit_log(table_name,record_id,action,actor,details) values('receipt_workflows',p_sale::text,p_action,p_actor,p_value - 'public_token');
  if p_action='print_start' then
    jid:=(p_value->>'job_id')::uuid;
    select * into j from receipt_print_jobs where id=jid;
    if found then
      if j.sale_id<>p_sale then raise exception 'FORBIDDEN'; end if;
      return jsonb_build_object('job',to_jsonb(j),'may_send',false);
    end if;
    select exists(select 1 from receipt_print_jobs where sale_id=p_sale) into prior;
    if prior and not coalesce((p_value->>'confirm_copy')::boolean,false) then raise exception 'HINWEIS:Druckstatus prüfen und erneuten Ausdruck als Kopie bestätigen.'; end if;
    if exists(select 1 from receipt_print_jobs where sale_id=p_sale and status='sending' and created_at>now()-interval '2 minutes') then raise exception 'HINWEIS:Ein Druckauftrag läuft noch. Bitte zwei Minuten warten und den Drucker prüfen.'; end if;
    insert into receipt_print_jobs(id,sale_id,actor,copy) values(jid,p_sale,p_actor,prior or w.stage='done') returning * into j;
    return jsonb_build_object('job',to_jsonb(j),'may_send',true);
  elsif p_action='print_finish' then
    state:=p_value->>'status';
    if state not in('confirmed','failed','unknown') or state is null then raise exception 'Invalid state'; end if;
    select * into j from receipt_print_jobs where id=(p_value->>'job_id')::uuid and sale_id=p_sale for update;
    if not found or j.actor<>p_actor then raise exception 'FORBIDDEN'; end if;
    if j.status='sending' then
      update receipt_print_jobs set status=state,detail=left(coalesce(p_value->>'detail',''),500),finished_at=now() where id=j.id;
      if state='confirmed' then update receipt_workflows set stage='done',medium='paper',output_method='epson',offered_at=now() where sale_id=p_sale; end if;
    end if;
  elsif p_action='manual_paper' then
    if not coalesce((p_value->>'confirmed')::boolean,false) then raise exception 'HINWEIS:Tatsächliche Papierausgabe zuerst bestätigen.'; end if;
    update receipt_workflows set stage='done',medium='paper',output_method='manual_pdf',offered_at=now() where sale_id=p_sale;
  elsif p_action='digital' then
    if not coalesce((p_value->>'consent')::boolean,false) then raise exception 'HINWEIS:Elektronische Ausgabe benötigt die Zustimmung des Kunden.'; end if;
    update receipt_workflows set stage='digital',consent_at=coalesce(consent_at,now()),
      public_token=coalesce(public_token,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
      share_expires_at=now()+interval '30 days' where sale_id=p_sale;
  elsif p_action='digital_offered' then
    if w.consent_at is null or w.public_token is null then raise exception 'HINWEIS:Elektronischen Beleg zuerst bereitstellen.'; end if;
    update receipt_workflows set stage='done',medium='digital',output_method='digital',offered_at=now() where sale_id=p_sale;
  else raise exception 'Invalid action'; end if;
  select * into w from receipt_workflows where sale_id=p_sale;
  return to_jsonb(w);
end $$;
revoke all on function public.receipt_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.receipt_command(uuid,uuid,text,jsonb) to service_role;
