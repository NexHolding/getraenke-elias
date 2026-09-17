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
const owner = crypto.randomUUID(),
  staff = crypto.randomUUID(),
  denied = crypto.randomUUID(),
  customer = crypto.randomUUID();
for (const [id, role, permissions, readonly] of [
  [owner, "owner", [], false],
  [staff, "staff", ["bestellungen"], false],
  [denied, "staff", ["bestellungen"], true],
]) {
  await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    "insert into staff(user_id,role,name,permissions,finance_readonly) values($1,$2,$3,$4,$5)",
    [id, role, "QA", JSON.stringify(permissions), readonly],
  );
}
await q(
  "insert into customers(id,name,email,phone,address,street,house_number,postal_code,city) values($1,'Testkunde','qa@example.test','0123456789','Teststraße 1, 74076 Heilbronn','Teststraße','1','74076','Heilbronn')",
  [customer],
);
const today = (
  await q("select (now() at time zone 'Europe/Berlin')::date::text as d")
)[0].d;
const item = "elias-036-v1";
const draft = () => ({
  request_id: crypto.randomUUID(),
  customer_id: customer,
  items: [{ id: item, quantity: 4 }],
  delivery_date: today,
  interval: null,
  notes: "Seitentür",
});
const create = async (v, actor = staff) =>
  (await q("select create_staff_order($1,$2) r", [JSON.stringify(v), actor]))[0]
    .r;
const before = (await q("select stock from products where id=$1", [item]))[0]
  .stock;
const v = draft();
const order = await create(v);
assert.deepEqual(await create(v), order);
const stored = (await q("select * from orders where id=$1", [order.id]))[0];
assert.equal(stored.created_by, staff);
assert.equal(stored.status, "confirmed");
assert.equal(stored.street, "Teststraße");
assert.equal(stored.items[0].quantity, 4);
assert.equal(stored.requested_delivery_date.toISOString().slice(0, 10), today);
assert.equal(
  (await q("select stock from products where id=$1", [item]))[0].stock,
  before,
);
await assert.rejects(create(draft(), denied), /FORBIDDEN/);
await q("update staff set permissions='[]' where user_id=$1", [denied]);
await assert.rejects(create(draft(), denied), /FORBIDDEN/);
await assert.rejects(
  create({
    ...draft(),
    items: [
      { id: item, quantity: 1 },
      { id: item, quantity: 2 },
    ],
  }),
  /doppelte/,
);
await assert.rejects(
  create({ ...draft(), items: [{ id: item, quantity: 1.5 }] }),
  /ganze/,
);
await assert.rejects(
  create({ ...draft(), delivery_date: "2020-01-01" }),
  /zukünftigen/,
);
await assert.rejects(
  create({
    ...draft(),
    items: [{ id: "missing", quantity: 1 }],
    interval: "weekly",
  }),
  /verfügbar/,
);
assert.equal(
  Number((await q("select count(*) n from subscriptions"))[0].n),
  0,
  "Invalid order leaves no orphan subscription",
);
const weekly = await create({ ...draft(), interval: "weekly" }, owner);
let sub = (
  await q("select * from subscriptions where id=$1", [weekly.subscription_id])
)[0];
assert.ok(sub.next_date.toISOString().slice(0, 10) > today);
assert.equal(
  (await q("select generate_subscription_orders() n"))[0].n,
  0,
  "First order not duplicated",
);
const save = async (s, actor = staff) =>
  (
    await q("select save_staff_subscription($1,$2) r", [
      JSON.stringify(s),
      actor,
    ])
  )[0].r;
const stale = { ...sub };
await save({ ...sub, active: false });
await assert.rejects(save(stale), /zwischenzeitlich/);
await q("update subscriptions set next_date=$2 where id=$1", [sub.id, today]);
assert.equal(
  (await q("select generate_subscription_orders() n"))[0].n,
  0,
  "Paused subscription not generated",
);
sub = (await q("select * from subscriptions where id=$1", [sub.id]))[0];
await assert.rejects(save({ ...sub, active: true }), /bereits eine Bestellung/);
// A due subscription independent of a first order, to test generation, recovery and price snapshots.
const sid = crypto.randomUUID();
await q(
  "insert into subscriptions(id,customer_id,items,interval,next_date,notes) values($1,$2,$3,'biweekly',$4,'Hof')",
  [sid, customer, JSON.stringify([{ id: item, quantity: 2 }]), today],
);
await q("update products set active=false where id=$1", [item]);
assert.equal((await q("select generate_subscription_orders() n"))[0].n, 0);
assert.match(
  (await q("select last_error from subscriptions where id=$1", [sid]))[0]
    .last_error,
  /verfügbar/,
);
await q("update products set active=true,price_cents=1234 where id=$1", [item]);
await q(
  'update settings set value=value||\'{"smtp_enabled":true,"smtp_from":"qa@example.test"}\'',
);
assert.equal((await q("select generate_subscription_orders() n"))[0].n, 1);
assert.equal((await q("select generate_subscription_orders() n"))[0].n, 0);
const recurring = (
  await q("select * from orders where subscription_id=$1", [sid])
)[0];
assert.equal(recurring.items[0].price_cents, 1234);
assert.equal(
  recurring.requested_delivery_date.toISOString().slice(0, 10),
  today,
);
assert.equal(recurring.city, "Heilbronn");
assert.match(recurring.notes, /Hof/);
assert.equal(
  (await q("select last_error from subscriptions where id=$1", [sid]))[0]
    .last_error,
  null,
);
const mail = (
  await q(
    "select body from mail_outbox where reference_id=$1 and kind='order_ack'",
    [recurring.id],
  )
)[0].body;
assert.match(mail, /Bestellung wurde erfasst/);
assert.doesNotMatch(mail, /unverbindliche Anfrage/);
assert.equal(
  Number(
    (
      await q(
        "select count(*) n from customer_communications where customer_id=$1",
        [customer],
      )
    )[0].n,
  ),
  1,
);
for (const [date, int, anchor, expected] of [
  ["2026-01-31", "monthly", 31, "2026-02-28"],
  ["2026-02-28", "monthly", 31, "2026-03-31"],
  ["2028-02-29", "yearly", 29, "2029-02-28"],
  ["2026-12-31", "quarterly", 31, "2027-03-31"],
])
  assert.equal(
    (
      await q("select subscription_next_date($1,$2,$3)::text d", [
        date,
        int,
        anchor,
      ])
    )[0].d,
    expected,
  );
// New monthly series preserves the first order's 31st-day anchor.
const monthly = await create({
  ...draft(),
  delivery_date: "2027-01-31",
  interval: "monthly",
});
const m = (
  await q("select * from subscriptions where id=$1", [monthly.subscription_id])
)[0];
assert.equal(m.anchor_day, 31);
assert.equal(m.next_date.toISOString().slice(0, 10), "2027-02-28");
// A failed selected customer never becomes visible or receives an order.
await q(
  "update customers set email='global_admin@getraenke-elias.local' where id=$1",
  [customer],
);
await assert.rejects(create(draft()), /gültigen Kunden/);
for (const f of [
  "create_staff_order(jsonb,uuid)",
  "save_staff_subscription(jsonb,uuid)",
  "order_product_snapshot(jsonb)",
  "order_customer(uuid)",
  "staff_order_access(uuid)",
])
  for (const role of ["anon", "authenticated"])
    assert.equal(
      (
        await q("select has_function_privilege($1,$2,'EXECUTE') v", [role, f])
      )[0].v,
      false,
    );
console.log(
  "PASS: staff/owner permissions, finance denial, trusted product/customer snapshots, transaction rollback, idempotency, unchanged stock, pause/resume, stale edits, duplicate dates, recurring current prices, failure recovery, communication archive, calendar anchors, hidden system account, RPC access.",
);
await db.close();
