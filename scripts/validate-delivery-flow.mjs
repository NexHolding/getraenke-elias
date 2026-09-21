// Full delivery lifecycle on isolated PostgreSQL. No external messages or production writes.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { planDay } from "../lib/delivery-plan.ts";
import { businessDocument } from "../lib/documents.ts";
import { buildFinanceReport } from "../lib/finance-report.ts";
import { receiptLogo } from "../lib/receipt-logo.ts";
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
  worker = crypto.randomUUID(),
  user = crypto.randomUUID(),
  other = crypto.randomUUID();
for (const [id, email] of [
  [owner, "qa-owner@example.test"],
  [worker, "qa-staff@example.test"],
  [user, "poststelle@nex-consulting.de"],
  [other, "qa-other@example.test"],
])
  await q("insert into auth.users values($1,$2)", [id, email]);
await q(
  "insert into staff(user_id,role,name,permissions)values($1,'owner','Testinhaber','[]'),($2,'staff','Testfahrer','[\"kunden\",\"lieferung\"]')",
  [owner, worker],
);
const c = (
  await q(
    "insert into customers(user_id,name,email,phone,address,street,house_number,postal_code,city,invoice_email)values($1,'Elias Testkunde','poststelle@nex-consulting.de','0713100000','Teststraße 1, 74076 Heilbronn','Teststraße','1','74076','Heilbronn',false) returning to_jsonb(customers)c",
    [user],
  )
)[0].c;
const otherC = (
  await q(
    "insert into customers(user_id,name,email) values($1,'Anderer Kunde','qa-other@example.test')returning id",
    [other],
  )
)[0].id;
await q("update products set stock=100 where active");
const product = (
  await q("select to_jsonb(products)p from products where id='elias-036-v1'")
)[0].p;
const today = (
  await q("select to_char(now() at time zone 'Europe/Berlin','YYYY-MM-DD')d")
)[0].d;
const command = {
  id: crypto.randomUUID(),
  request_id: crypto.randomUUID(),
  revision: null,
  customer_id: c.id,
  items: [{ id: product.id, quantity: 4 }],
  interval: "biweekly",
  next_date: today,
  active: true,
  notes: "Bitte klingeln.",
};
const save = async (v, actor = user, customer = true) =>
  (
    await q("select save_delivery_subscription($1,$2,$3)s", [
      JSON.stringify(v),
      actor,
      customer,
    ])
  )[0].s;
await assert.rejects(
  () => save({ ...command, customer_id: otherC }),
  /FORBIDDEN/,
);
await assert.rejects(() => save(command, other, false), /FORBIDDEN/);
await assert.rejects(
  () => save({ ...command, items: [{ id: product.id, quantity: 1 }] }),
  /vier/,
);
const subscription = await save(command);
assert.equal(subscription.customer_requested, true);
assert.deepEqual(await save(command), subscription);
const staffSub = await save(
  {
    ...command,
    id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    active: false,
  },
  worker,
  false,
);
assert.equal(staffSub.customer_id, c.id);
assert.equal((await q("select generate_subscription_orders()n"))[0].n, 1);
assert.equal((await q("select generate_subscription_orders()n"))[0].n, 0);
let order = (
  await q("select to_jsonb(orders)o from orders where subscription_id=$1", [
    subscription.id,
  ])
)[0].o;
assert.equal(order.status, "confirmed");
assert.ok(order.auto_confirmed_at);
assert.equal(
  (await q("select count(*)n from mail_outbox where kind='order_ack'"))[0].n,
  1,
); // queued even with SMTP disabled
let current = (
  await q("select to_jsonb(subscriptions)s from subscriptions where id=$1", [
    subscription.id,
  ])
)[0].s;
await assert.rejects(
  () =>
    save({
      ...command,
      request_id: crypto.randomUUID(),
      revision: subscription.revision,
    }),
  /zwischenzeitlich/,
);
const pause = {
  ...command,
  request_id: crypto.randomUUID(),
  revision: current.revision,
  next_date: current.next_date,
  active: false,
};
await save(pause);
assert.deepEqual(await save(pause), await save(pause));
await q("select approve_order_payment($1,$2)", [
  JSON.stringify({
    id: order.id,
    status: "confirmed",
    payment_method: "invoice",
    expected_revision: 0,
  }),
  owner,
]);
order = (
  await q("select to_jsonb(orders)o from orders where id=$1", [order.id])
)[0].o;
const cfg = (await q("select value from settings where id=1"))[0].value;
cfg.delivery_days = [1, 2, 3, 4, 5, 6, 7];
const plan = planDay([order], today, cfg);
assert.equal(plan.stops.length, 1);
const stop = plan.stops[0];
await q(
  "update orders set delivery_date=$1,eta_start=$2,eta_end=$3,route_position=$4 where id=$5",
  [today, stop.eta_start, stop.eta_end, stop.position, order.id],
);
const deliver = async (
  id,
  items,
  finalize,
  signature,
  actor = worker,
  revision = 0,
) =>
  (
    await q("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)d", [
      order.id,
      id,
      JSON.stringify(items),
      revision,
      actor,
      finalize,
      signature,
      "Testempfänger",
    ])
  )[0].d;
const id = crypto.randomUUID();
const items = [{ id: product.id, quantity: 2 }];
await assert.rejects(() => deliver(id, items, true, null), /Kundenunterschrift/);
await assert.rejects(
  () => deliver(id, items, true, receiptLogo, other),
  /FORBIDDEN/,
);
await deliver(id, items, false, null);
assert.equal((await q("select count(*)n from invoices"))[0].n, 0);
assert.equal(
  (await q("select stock from products where id=$1", [product.id]))[0].stock,
  100,
);
const d1 = await deliver(id, items, true, receiptLogo);
assert.equal(d1.status, "delivered");
assert.deepEqual(await deliver(id, items, true, receiptLogo), d1);
assert.equal(
  (await q("select stock from products where id=$1", [product.id]))[0].stock,
  98,
);
const d2 = await deliver(crypto.randomUUID(), items, true, receiptLogo);
assert.deepEqual(await deliver(d2.id, items, true, receiptLogo), d2);
assert.equal(
  (await q("select stock from products where id=$1", [product.id]))[0].stock,
  96,
);
order = (
  await q("select to_jsonb(orders)o from orders where id=$1", [order.id])
)[0].o;
assert.equal(order.status, "completed");
const invoices = (
  await q("select to_jsonb(invoices)i from invoices order by created_at")
).map((x) => x.i);
assert.equal(invoices.length, 2);
for (const kind of ["delivery_document", "invoice_document"])
  assert.equal(
    (await q("select count(*)n from mail_outbox where kind=$1", [kind]))[0].n,
    2,
  );
assert.equal(
  (
    await q(
      "select count(*)n from customer_communications where customer_id=$1 and kind not like 'order_schedule_%'",
      [c.id],
    )
  )[0].n,
  5,
);
await q(
  "update customers set name='Geänderter Kundenname',address='Neue Adresse' where id=$1",
  [c.id],
);
assert.equal(d1.order_snapshot.customer_name, "Elias Testkunde");
assert.equal(d1.order_snapshot.delivered[product.id], 2);
assert.equal(d2.order_snapshot.delivered[product.id], 4);
const laterDelivery = businessDocument(
  "delivery",
  {
    ...d1,
    created_at: "2020-01-01T10:00:00Z",
    delivered_at: "2026-09-21T10:00:00Z",
  },
  order,
  cfg,
);
assert.ok(laterDelivery.bytes.includes(Buffer.from("21.09.2026")));
assert.ok(!laterDelivery.bytes.includes(Buffer.from("01.01.2020")));
const finance = buildFinanceReport([], invoices, today.slice(0, 7), cfg);
assert.equal(
  finance.all.gross,
  4 * (product.price_cents + product.deposit_cents),
);
assert.equal(finance.all.cash, 0);
await mkdir("output/delivery-flow", { recursive: true });
for (const [kind, record] of [
  ["delivery", d1],
  ["invoice", invoices[0]],
]) {
  const pdf = businessDocument(kind, record, order, cfg);
  await writeFile("output/delivery-flow/" + pdf.filename, pdf.bytes);
}
const products = (
  await q("select to_jsonb(products)p from products where active order by name")
).map((x) => x.p);
await writeFile(
  "output/delivery-flow/fixtures.json",
  JSON.stringify({
    customer: c,
    subscriptions: [subscription, staffSub],
    order,
    deliveries: [d1, d2],
    invoices,
    settings: cfg,
    products,
    mail: (
      await q(
        "select to_jsonb(customer_communications)m from customer_communications",
      )
    ).map((x) => x.m),
  }),
);
assert.equal(
  (
    await q(
      "select has_function_privilege('authenticated','save_delivery_subscription(jsonb,uuid,boolean)','execute')ok",
    )
  )[0].ok,
  false,
);
assert.equal(
  (
    await q(
      "select has_table_privilege('authenticated','business_documents','select')ok",
    )
  )[0].ok,
  false,
);
console.log(
  "PASS: customer/staff subscription create/edit/pause, ownership and stale revision checks, idempotent commands and recurrence, customer inquiry, route plan, signed partial and final delivery, retry without duplicate stock/invoice/mail, automatic invoice despite legacy preference, preserved snapshots, portal records, queued communications, accounting totals, PDF generation, private archive. No network or production writes.",
);
await db.close();
