import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 const q=async(s,a=[])=>JSON.parse(JSON.stringify((await db.query(s,a)).rows));
 const user=crypto.randomUUID(),owner=crypto.randomUUID(),other=crypto.randomUUID();
 for(const id of [user,owner,other])await q('insert into auth.users values($1,$2)',[id,id+'@example.test']);
 await q("insert into staff(user_id,role,name)values($1,'owner','Owner')",[owner]);
 const c=(await q("insert into customers(user_id,name,email,phone,address,street,house_number,postal_code,city,notes,windows,latitude,longitude,dropoff_note)values($1,'Delete Person','delete@example.test','01234','Private 1','Private','1','74076','Heilbronn','private note','[{\"day\":1,\"from\":\"10:00\",\"to\":\"18:00\"}]',49,9,'Private door')returning *",[user]))[0];
 const s=(await q("insert into subscriptions(customer_id,items,interval,next_date,notes)values($1,'[{\"id\":\"elias-036-v1\",\"quantity\":4}]','weekly',current_date+5,'private sub')returning *",[c.id]))[0];
 await q("insert into subscription_commands values($1,$2,$3,'{}','{}',now())",[crypto.randomUUID(),s.id,user]);
 const addOrder=async(status)=>(await q("insert into orders(customer_id,subscription_id,customer_name,email,phone,address,items,status,approved_payment_method)values($1,$2,'Delete Person','delete@example.test','01234','Private 1','[]',$3,'invoice')returning *",[c.id,s.id,status]))[0];
 const unconfirmed=await addOrder('new'),accepted=await addOrder('confirmed'),cancelled=await addOrder('cancelled');
 // Use a draft legal-document fixture; immutable originals must not be rewritten by erasure.
 const delivery=(await q("insert into deliveries(order_id,customer_id,items)values($1,$2,'[]')returning *",[accepted.id,c.id]))[0];
 const invoice=(await q("insert into invoices(order_id,delivery_id,customer_id,customer_snapshot,items,total_cents,net_cents,tax_cents,deposit_cents)values($1,$2,$3,'{\"name\":\"Delete Person\",\"email\":\"delete@example.test\"}','[]',0,0,0,0)returning *",[accepted.id,delivery.id,c.id]))[0];
 const ack=(await q("select id from mail_outbox where kind='order_ack' and reference_id=$1",[unconfirmed.id]))[0];
 await q("insert into customer_communications(customer_id,source_key,kind,recipient,subject,body)values($1,'legal-copy-with-expired-outbox','invoice_document','delete@example.test','Invoice','Legal retained')",[c.id]);
 await q("insert into customer_communications(customer_id,auth_user_id,source_key,kind,recipient,subject,body)values($1,$2,'auth','auth_signup','delete@example.test','Account','Private auth')",[c.id,user]);
 const stocks=await q('select id,stock from products order by id');
 const request=crypto.randomUUID();
 await assert.rejects(()=>q('select prepare_customer_account_deletion($1,$2)',[owner,request]),/FORBIDDEN/);
 await assert.rejects(()=>q('select prepare_customer_account_deletion($1,$2)',[crypto.randomUUID(),request]),/UNAUTHORIZED/);
 const deleted=(await q('select prepare_customer_account_deletion($1,$2)v',[user,request]))[0].v;
 assert.equal(deleted.status,'pending');assert.equal(deleted.retained_business_records,true);
 assert.equal((await q('select * from customers where id=$1',[c.id]))[0].name,'Gelöschtes Kundenkonto');
 const profile=(await q('select * from customers where id=$1',[c.id]))[0];
 for(const key of ['address','street','house_number','postal_code','city','phone','notes','dropoff_note'])assert.equal(profile[key],'');
 assert.equal(profile.user_id,null);assert.equal(profile.latitude,null);assert.equal(profile.longitude,null);assert.deepEqual(profile.windows,[]);
 assert.equal((await q('select * from subscriptions where id=$1',[s.id]))[0].active,false);
 assert.deepEqual((await q('select * from subscriptions where id=$1',[s.id]))[0].items,[]);
 assert.equal((await q('select * from subscription_commands')).length,0);
 assert.equal((await q('select * from orders where id=any($1)',[[unconfirmed.id,cancelled.id]])).length,0);
 assert.deepEqual((await q('select * from orders where id=$1',[accepted.id]))[0],accepted);
 assert.deepEqual((await q('select * from deliveries where id=$1',[delivery.id]))[0],delivery);
 assert.deepEqual((await q('select * from invoices where id=$1',[invoice.id]))[0],invoice);
 assert.equal((await q('select * from mail_outbox where id=$1',[ack.id])).length,0);
 assert.equal((await q("select * from customer_communications where source_key='outbox:'||$1",[ack.id])).length,0);
 assert.equal((await q("select * from customer_communications where source_key='auth'")).length,0);
 assert.equal((await q("select * from customer_communications where source_key='legal-copy-with-expired-outbox'")).length,1);
 assert.ok(!(JSON.stringify(await q("select details from audit_log where (table_name='customers' and record_id=$1) or (table_name='subscriptions' and record_id=$2)",[c.id,s.id]))).includes('Private'));
 assert.deepEqual(await q('select id,stock from products order by id'),stocks);
 assert.deepEqual((await q('select prepare_customer_account_deletion($1,$2)v',[user,crypto.randomUUID()]))[0].v,deleted,'retry returns original request');
 await assert.rejects(()=>q('select prepare_customer_account_deletion($1,$2)',[other,request]),/FORBIDDEN/);
 await assert.rejects(()=>q("insert into customers(user_id,name,email)values($1,'Race','race@example.test')",[user]),/wird gelöscht/);
 await assert.rejects(()=>q("update audit_log set details='{}'"),/immutable/);
 await assert.rejects(()=>q("delete from audit_log"),/immutable/);
 // Auth hard-deletion can now complete without customer subscription-command FK blockers.
 await q('delete from auth.users where id=$1',[user]);
 // A fresh auth identity with the former email cannot inherit retained business records.
 await q("insert into customers(user_id,name,email)values($1,'New Customer','delete@example.test')",[other]);
 const fresh=(await q('select prepare_customer_account_deletion($1,$2)v',[other,crypto.randomUUID()]))[0].v;
 assert.equal(fresh.retained_business_records,false);
 assert.equal((await q('select * from customers where user_id=$1',[other])).length,0);
 // User with no linked customer (including an unverified email matching an offline record).
 const unlinked=crypto.randomUUID();await q("insert into auth.users values($1,'offline@example.test')",[unlinked]);
 const offline=(await q("insert into customers(name,email)values('Offline','offline@example.test')returning *"))[0];
 await q('select prepare_customer_account_deletion($1,$2)',[unlinked,crypto.randomUUID()]);
 assert.deepEqual((await q('select * from customers where id=$1',[offline.id]))[0],offline);
 for(const role of ['anon','authenticated']) {
  assert.equal((await q("select has_function_privilege($1,'prepare_customer_account_deletion(uuid,uuid)','EXECUTE')v",[role]))[0].v,false);
  await db.exec('set role '+role);await assert.rejects(()=>q('select * from customer_account_deletions'),/permission denied/);await db.exec('reset role');
 }
 console.log('PASS account erasure: profile, coordinates, audit copies, auth mail, request mail, subscriptions; legal snapshots and stock unchanged; staff protected; unlinked accounts isolated; replay and request collision; hard-delete FK check; private permissions.');
} finally {await db.close();}
