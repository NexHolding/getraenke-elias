import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const staff = crypto.randomUUID(),
  owner = crypto.randomUUID(),
  denied = crypto.randomUUID();
for (const [id, role, permissions, readonly] of [
  [staff, "staff", ["einkauf"], false],
  [owner, "owner", [], false],
  [denied, "staff", ["einkauf"], true],
]) {
  await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    "insert into staff(user_id,role,name,permissions,finance_readonly) values($1,$2,$3,$4,$5)",
    [id, role, "QA", JSON.stringify(permissions), readonly],
  );
}
const supplier = "qa-manual-supplier",
  other = "qa-other-supplier",
  id = "elias-036-v1";
await q(
  "insert into suppliers(id,name,email,auto_send) values($1,'QA','supplier@example.test',true),($2,'Other','other@example.test',false)",
  [supplier, other],
);
await q(
  "update products set supplier_id=$2,stock=2,min_stock=5,target_stock=12,reorder_enabled=true where id=$1",
  [id, supplier],
);
const before = (
  await q(
    "select stock,min_stock,target_stock,reorder_enabled,supplier_id from products where id=$1",
    [id],
  )
)[0];
const cfg = (await q("select value from settings"))[0].value;
const draft = () => ({
  request_id: crypto.randomUUID(),
  supplier_id: supplier,
  items: [{ id, quantity: 100 }],
  reference: "Kundenauftrag EL-123",
  notes: "Zusätzlich",
});
const create = async (v, actor = staff) =>
  (
    await q("select create_manual_purchase($1,$2) p", [
      JSON.stringify(v),
      actor,
    ])
  )[0].p;
const manage = async (p, action, actor = staff) =>
  (await q("select manage_purchase($1,$2,$3) p", [p, action, actor]))[0].p;
const v = draft(),
  p = await create(v);
assert.equal(p.source, "manual");
assert.equal(p.status, "draft");
assert.equal(p.items[0].quantity, 100);
assert.equal(p.created_by, staff);
assert.deepEqual(await create(v), p);
assert.equal(
  Number(
    (
      await q("select count(*) n from mail_outbox where reference_id=$1", [
        p.id,
      ])
    )[0].n,
  ),
  0,
  "Automatic supplier approval must not auto-send a manual draft",
);
assert.deepEqual(
  (
    await q(
      "select stock,min_stock,target_stock,reorder_enabled,supplier_id from products where id=$1",
      [id],
    )
  )[0],
  before,
);
assert.deepEqual((await q("select value from settings"))[0].value, cfg);
assert.equal(
  Number((await q("select count(*) n from automation_runs"))[0].n),
  0,
);
await assert.rejects(create(draft(), denied), /FORBIDDEN/);
await q(
  "update staff set finance_readonly=false,permissions='[\"kasse\"]' where user_id=$1",
  [denied],
);
await assert.rejects(create(draft(), denied), /FORBIDDEN/);
await assert.rejects(
  create({ ...draft(), supplier_id: other }),
  /anderen Lieferanten/,
);
await assert.rejects(
  create({ ...draft(), items: [{ id, quantity: 1.5 }] }),
  /ganze/,
);
await assert.rejects(
  create({
    ...draft(),
    items: [
      { id, quantity: 1 },
      { id, quantity: 2 },
    ],
  }),
  /doppelte/,
);
await assert.rejects(
  create({ ...draft(), requested_date: "2020-01-01" }),
  /Vergangenheit/,
);
await assert.rejects(manage(p.id, "email"), /E-Mail-Server/);
assert.equal(
  (await q("select status from purchases where id=$1", [p.id]))[0].status,
  "draft",
);
// Same data with and without manual purchases must produce identical automatic quantity, preserving every automatic schedule lock.
await q(
  "update settings set value=value||jsonb_build_object('auto_reorder',true,'reorder_time','00:00','reorder_days',jsonb_build_array(extract(isodow from now() at time zone 'Europe/Berlin')::integer),'reorder_anchor',to_char(now(),'YYYY-MM-DD'))",
);
await q("insert into purchases(supplier_id,items) values($1,$2)", [
  supplier,
  JSON.stringify([{ id, name: "Existing automatic", quantity: 3 }]),
]);
const beforeRuns = (await q("select count(*) n from automation_runs"))[0].n;
assert.equal(Number(beforeRuns), 0);
assert.equal((await q("select generate_reorders() n"))[0].n, 1);
let auto = (
  await q(
    "select * from purchases where source='automatic' order by created_at desc limit 1",
  )
)[0];
assert.equal(
  auto.items[0].quantity,
  7,
  "12 target minus 2 stock minus 3 regular pending; extra 100 does not reduce regular demand",
);
assert.equal((await q("select generate_reorders() n"))[0].n, 0);
const ownerOrder = await create(draft(), owner);
assert.equal(ownerOrder.status, "draft");
assert.equal(
  (await q("select count(*) n from automation_runs where kind='reorder'"))[0].n,
  1,
  "Manual order must not consume or reset schedule slot",
);
// Manual queued and sent states are also excluded from the automatic formula.
await q(
  'update settings set value=value||\'{"smtp_enabled":true,"smtp_host":"smtp.example.test","smtp_from":"elias@example.test","smtp_user":"qa"}\',smtp_secret=\'isolated-placeholder\'',
);
await q("update suppliers set auto_send=false where id=$1", [supplier]);
const queued = await manage(p.id, "email");
assert.equal(queued.status, "queued");
assert.equal(queued.dispatch_method, "email");
assert.deepEqual(await manage(p.id, "email"), queued);
const mail = (
  await q("select * from mail_outbox where reference_id=$1", [p.id])
)[0];
assert.match(mail.body, /zusätzlich zu unseren regulären Bestellungen/);
assert.match(mail.body, /100 ×/);
assert.equal(mail.recipient, "supplier@example.test");
const external = await manage(ownerOrder.id, "external");
assert.equal(external.status, "sent");
assert.deepEqual(await manage(ownerOrder.id, "external"), external);
await assert.rejects(manage(ownerOrder.id, "cancel"), /kein Entwurf/);
await q("delete from automation_runs where kind='reorder'");
assert.equal(
  (await q("select generate_reorders() n"))[0].n,
  0,
  "No additional regular demand: existing 3+7 regular pending; manual queued and sent ignored",
);
await q("update purchases set status='cancelled' where source='automatic'");
await q("delete from automation_runs where kind='reorder'");
assert.equal((await q("select generate_reorders() n"))[0].n, 1);
auto = (
  await q(
    "select * from purchases where source='automatic' and status<>'cancelled'",
  )
)[0];
assert.equal(
  auto.items[0].quantity,
  10,
  "100 queued and 100 external still do not suppress regular demand",
);
// Actual receipt adds physical stock exactly once; configuration remains unchanged.
await q("select receive_purchase($1,$2)", [ownerOrder.id, staff]);
await q("select receive_purchase($1,$2)", [ownerOrder.id, staff]);
assert.equal(
  (await q("select stock from products where id=$1", [id]))[0].stock,
  102,
);
assert.equal(
  Number(
    (
      await q("select count(*) n from stock_movements where reason=$1", [
        "Wareneingang " + ownerOrder.id,
      ])
    )[0].n,
  ),
  1,
);
const cancel = await create(draft());
assert.equal((await manage(cancel.id, "cancel")).status, "cancelled");
await assert.rejects(manage(cancel.id, "external"), /kein Entwurf/);
for (const f of [
  "create_manual_purchase(jsonb,uuid)",
  "manage_purchase(uuid,text,uuid)",
  "purchase_staff_access(uuid)",
])
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await q("select has_function_privilege($1,$2,'EXECUTE') v", [role, f])
      )[0].v,
      false,
    );
console.log(
  "PASS: 100 extra crates never suppress regular quantities in draft/queued/sent; schedules and master data preserved; permissions, idempotency, supplier validation, no automatic sending, explicit email dispatch, external ordering, cancellation, exactly-once physical receipt.",
);
await db.close();
