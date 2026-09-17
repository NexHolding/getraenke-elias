create or replace function generate_subscription_orders() returns integer language plpgsql security definer set search_path=public as $$declare s subscriptions;c customers;l jsonb;p products;rows jsonb;n integer:=0;next_day date;today date;begin
 perform pg_advisory_xact_lock(17092028);today:=(now() at time zone 'Europe/Berlin')::date;
 for s in select * from subscriptions where active and next_date<=today order by id for update loop
 select * into c from customers where id=s.customer_id;rows:='[]';
 for l in select value from jsonb_array_elements(s.items) loop
 select * into p from products where id=l->>'id' and active;if not found then rows:='[]';exit;end if;
 rows:=rows||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'quantity',(l->>'quantity')::integer,'price_cents',p.price_cents,'deposit_cents',p.deposit_cents,'tax_rate',p.tax_rate,'deposit_tax_rate',p.deposit_tax_rate,'pack_count',p.pack_count,'kind',p.kind));end loop;
 if jsonb_array_length(rows)=0 or c.address='' or c.phone='' then continue;end if;
 insert into orders(customer_id,customer_name,email,phone,address,notes,items,status,preference_snapshot,subscription_id,recurrence_date) values(c.id,c.name,c.email,c.phone,c.address,'Wiederkehrende Lieferung',rows,'confirmed',jsonb_build_object('windows',c.windows,'dropoff_allowed',c.dropoff_allowed,'dropoff_note',c.dropoff_note,'latitude',c.latitude,'longitude',c.longitude),s.id,s.next_date) on conflict do nothing;if found then n:=n+1;end if;
 next_day:=s.next_date;
 loop next_day:=(next_day+case s.interval when 'weekly' then interval '7 days' when 'biweekly' then interval '14 days' when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' when 'halfyearly' then interval '6 months' else interval '1 year' end)::date;exit when next_day>today;end loop;
 update subscriptions set next_date=next_day where id=s.id;
 end loop;return n;end;$$;
revoke all on function generate_subscription_orders() from public,anon,authenticated;grant execute on function generate_subscription_orders() to service_role;
