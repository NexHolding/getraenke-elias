import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const f of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const user = crypto.randomUUID();
await q("insert into auth.users values($1,$2)", [user, "qa@example.test"]);
const m = (
  await q(
    "insert into customer_communications(source_key,auth_user_id,kind,recipient,subject,body) values('qa-auth',$1,'auth_signup','qa@example.test','Bestätigung','Sicherer Archivtext') returning id",
    [user],
  )
)[0];
const customer = (
  await q(
    "insert into customers(user_id,name,email) values($1,'QA Kunde','qa@example.test') returning id",
    [user],
  )
)[0];
assert.equal(
  (
    await q("select customer_id from customer_communications where id=$1", [
      m.id,
    ])
  )[0].customer_id,
  customer.id,
);
const outbox = (
  await q(
    "insert into mail_outbox(kind,recipient,subject,body) values('order_ack','qa@example.test','Bestellung','Originaltext') returning id",
  )
)[0];
const archive = (
  await q("select * from customer_communications where source_key=$1", [
    "outbox:" + outbox.id,
  ])
)[0];
assert.equal(archive.customer_id, customer.id);
await q("update mail_outbox set status='sent',sent_at=now() where id=$1", [
  outbox.id,
]);
assert.equal(
  (
    await q("select status from customer_communications where id=$1", [
      archive.id,
    ])
  )[0].status,
  "sent",
);
await assert.rejects(() =>
  q("update customer_communications set body='Manipuliert' where id=$1", [
    archive.id,
  ]),
);
await q(
  "insert into communication_attachments(communication_id,filename,content_type,size_bytes,sha256,content_base64) values($1,'beleg.pdf','application/pdf',3,$2,'YWJj')",
  [archive.id, "a".repeat(64)],
);
await assert.rejects(() =>
  q(
    "update communication_attachments set content_base64='xxx' where communication_id=$1",
    [archive.id],
  ),
);
await q("delete from mail_outbox where id=$1", [outbox.id]);
assert.equal(
  (
    await q("select body from customer_communications where id=$1", [
      archive.id,
    ])
  )[0].body,
  "Originaltext",
);

const queued = (
  await q(
    "select queue_auth_mail('queue-test',$1,'qa@example.test','auth_recovery','Reset','[Sicherheitslink]','encrypted-data') id",
    [user],
  )
)[0].id;
assert.equal(
  (
    await q(
      "select queue_auth_mail('queue-test',$1,'qa@example.test','auth_recovery','Reset','[Sicherheitslink]','other') id",
      [user],
    )
  )[0].id,
  queued,
);
assert.equal(
  (await q("select * from claim_auth_mail($1)", [queued])).length,
  1,
);
assert.equal(
  (await q("select * from claim_auth_mail($1)", [queued])).length,
  0,
);
await q(
  "update auth_mail_dispatch set claimed_at=now()-interval '3 minutes' where communication_id=$1",
  [queued],
);
await q("select * from claim_auth_mail($1)", [queued]);
assert.equal(
  (
    await q("select status from customer_communications where id=$1", [queued])
  )[0].status,
  "uncertain",
);
assert.equal(
  (
    await q("select * from auth_mail_dispatch where communication_id=$1", [
      queued,
    ])
  ).length,
  0,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec("set role " + role);
  await assert.rejects(() => q("select * from customer_communications"));
  await assert.rejects(() => q("select * from communication_attachments"));
  await assert.rejects(() => q("select * from auth_mail_dispatch"));
  await assert.rejects(() => q("select * from claim_auth_mail(null)"));
  await db.exec("reset role");
}
console.log(
  "PASS: correspondence links after registration, outbox status sync, immutable messages/attachments, survives outbox removal, no anonymous/authenticated direct database access.",
);
await db.close();
