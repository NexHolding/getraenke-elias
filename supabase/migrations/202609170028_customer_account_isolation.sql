-- New online accounts must not inherit orphaned correspondence merely by email.
-- Existing explicit customer and auth-user associations are unchanged.
create or replace function public.link_customer_communications() returns trigger
language plpgsql security definer set search_path=public as $$begin
 update customer_communications set customer_id=NEW.id
 where customer_id is null and lower(recipient)=lower(NEW.email)
 and ((NEW.user_id is not null and auth_user_id=NEW.user_id)
      or (NEW.user_id is null and auth_user_id is null));
 return NEW;
end;$$;
