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
const owner = crypto.randomUUID(),
  staff = crypto.randomUUID(),
  other = crypto.randomUUID(),
  customer = crypto.randomUUID();
for (const id of [owner, staff, other, customer])
  await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
for (const [id, role] of [
  [owner, "owner"],
  [staff, "staff"],
  [other, "staff"],
])
  await q(
    `insert into staff(user_id,role,name,permissions) values($1,$2,'QA','["kasse"]')`,
    [id, role],
  );
const id = crypto.randomUUID();
await q("update products set stock=100 where id='elias-036-v1'");
const sale = () =>
  q(`select save_sale($1,'[{"id":"elias-036-v1","quantity":1}]','cash',$2) s`, [
    id,
    staff,
  ]);
await sale();
await sale();
assert.equal(
  (await q("select stock from products where id='elias-036-v1'"))[0].stock,
  99,
);
assert.equal(
  (
    await q("select count(*) n from receipt_workflows where sale_id=$1", [id])
  )[0].n,
  1,
);
const command = async (actor, action, value = {}, saleId = id) =>
  (
    await q("select receipt_command($1,$2,$3,$4) v", [
      saleId,
      actor,
      action,
      JSON.stringify(value),
    ])
  )[0].v;
await assert.rejects(
  () => command(staff, "digital", { consent: true }),
  /archivieren/,
);
await q(
  "insert into receipt_documents(sale_id,pdf_base64,sha256) values($1,$2,$3)",
  [id, "A".repeat(200), "a".repeat(64)],
);
await assert.rejects(
  () =>
    q("update receipt_documents set pdf_base64=$1 where sale_id=$2", [
      "B".repeat(200),
      id,
    ]),
  /immutable/,
);
await assert.rejects(
  () => q("delete from receipt_documents where sale_id=$1", [id]),
  /immutable/,
);
for (const actor of [customer, other])
  await assert.rejects(
    () => command(actor, "digital", { consent: true }),
    /FORBIDDEN/,
  );
await assert.rejects(
  () => command(staff, "digital", { consent: false }),
  /Zustimmung/,
);
await assert.rejects(() => command(staff, "digital_offered"), /bereitstellen/);
let result = await command(staff, "print_start", {
  job_id: crypto.randomUUID(),
});
assert.equal(result.may_send, true);
assert.equal(result.job.copy, false);
assert.equal(
  (await command(staff, "print_start", { job_id: result.job.id })).may_send,
  false,
);
await assert.rejects(
  () => command(staff, "print_start", { job_id: crypto.randomUUID() }),
  /Kopie/,
);
await assert.rejects(
  () =>
    command(staff, "print_start", {
      job_id: crypto.randomUUID(),
      confirm_copy: true,
    }),
  /läuft noch/,
);
await command(staff, "print_finish", {
  job_id: result.job.id,
  status: "unknown",
  detail: "Timeout",
});
assert.equal(
  (await q("select stage from receipt_workflows where sale_id=$1", [id]))[0]
    .stage,
  "pending",
);
const retry = await command(staff, "print_start", {
  job_id: crypto.randomUUID(),
  confirm_copy: true,
});
assert.equal(retry.job.copy, true);
await command(staff, "print_finish", {
  job_id: retry.job.id,
  status: "confirmed",
});
// Late duplicate completion cannot change terminal job status.
await command(staff, "print_finish", {
  job_id: retry.job.id,
  status: "failed",
});
assert.equal(
  (
    await q("select status from receipt_print_jobs where id=$1", [retry.job.id])
  )[0].status,
  "confirmed",
);
assert.equal(
  (
    await q("select stage,medium from receipt_workflows where sale_id=$1", [id])
  )[0].medium,
  "paper",
);
const digital = await command(staff, "digital", { consent: true });
assert.match(digital.public_token, /^[a-f0-9]{64}$/);
assert.equal(
  (await command(staff, "digital", { consent: true })).public_token,
  digital.public_token,
);
assert.ok(new Date(digital.share_expires_at) > new Date());
const offered = await command(staff, "digital_offered");
assert.equal(offered.stage, "done");
assert.equal(offered.medium, "digital");
assert.ok(offered.offered_at);
await q("update staff set active=false where user_id=$1", [staff]);
await assert.rejects(
  () => command(staff, "digital", { consent: true }),
  /FORBIDDEN/,
);
assert.equal(
  (await q("select stock from products where id='elias-036-v1'"))[0].stock,
  99,
);
await assert.rejects(
  () => command(owner, "manual_paper", { confirmed: false }),
  /Papierausgabe/,
);
assert.equal(
  (await command(owner, "manual_paper", { confirmed: true })).output_method,
  "manual_pdf",
);
// Existing setup reset can cascade; archive cannot be deleted directly.
await q("delete from sales where id=$1 and test_mode=true", [id]);
for (const table of [
  "receipt_documents",
  "receipt_workflows",
  "receipt_print_jobs",
])
  assert.equal(
    (await q(`select count(*) n from ${table} where sale_id=$1`, [id]))[0].n,
    0,
  );
for (const table of [
  "receipt_documents",
  "receipt_workflows",
  "receipt_print_jobs",
]) {
  assert.equal(
    (
      await q("select relrowsecurity from pg_class where relname=$1", [table])
    )[0].relrowsecurity,
    true,
  );
  assert.equal(
    (
      await q(
        `select has_table_privilege('authenticated',$1,'SELECT') allowed`,
        [table],
      )
    )[0].allowed,
    false,
  );
}
console.log(
  "PASS receipt workflow: atomic recovery, one stock deduction, immutable archive, permissions, printer timeout, duplicate suppression, explicit copy, consent, digital offer, setup cascade and RLS",
);
await db.close();
