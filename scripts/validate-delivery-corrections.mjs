import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { deliveryListPdf } from "../lib/delivery-list.ts";
import { businessDocument } from "../lib/documents.ts";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const q = async (sql, args = []) =>
    JSON.parse(JSON.stringify((await db.query(sql, args)).rows));
  const owner = crypto.randomUUID(),
    driver = crypto.randomUUID(),
    clerk = crypto.randomUUID();
  for (const id of [owner, driver, clerk])
    await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    `insert into staff(user_id,name,role,permissions) values($1,'Chef','owner','[]'),($2,'Fahrer','staff','["lieferung"]'),($3,'Verkauf','staff','["bestellungen"]')`,
    [owner, driver, clerk],
  );
  const c = (
    await q(
      `insert into customers(name,email,address,payment_method)values('Musterkunde','customer@example.test','Teststraße 1, 74076 Heilbronn','cash')returning *`,
    )
  )[0];
  const items = [
    {
      id: "elias-036-v1",
      name: "Alwa Orange · 6 × 1 l",
      quantity: 4,
      price_cents: 999,
      deposit_cents: 240,
      tax_rate: 19,
      deposit_tax_rate: 19,
    },
    {
      id: "elias-036-v2",
      name: "Alwa Zitrone · 6 × 1 l",
      quantity: 2,
      price_cents: 899,
      deposit_cents: 240,
      tax_rate: 19,
      deposit_tax_rate: 19,
    },
  ];
  await q("update products set stock=10 where id=any($1)", [
    items.map((i) => i.id),
  ]);
  let o = (
    await q(
      `insert into orders(auto_processing,customer_id,customer_name,email,phone,address,items,requested_payment_method,status,preference_snapshot)values(false,$1,$2,$3,'071310000',$4,$5,'invoice','new','{"dropoff_allowed":true}')returning *`,
      [c.id, c.name, c.email, c.address, JSON.stringify(items)],
    )
  )[0];
  const approve = (
    method,
    revision = o.payment_revision,
    status = "confirmed",
    actor = owner,
  ) =>
    q("select approve_order_payment($1,$2)v", [
      JSON.stringify({
        id: o.id,
        status,
        payment_method: method,
        expected_revision: revision,
      }),
      actor,
    ]).then((r) => r[0].v);
  const command = {
    order_id: o.id,
    id: crypto.randomUUID(),
    items: items.map((i, index) => ({ id: i.id, quantity: index ? 0 : 2 })),
    revision: 0,
    finalize: true,
    signed_name: "Empfang",
    signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=",
    expected_payment_method: "invoice",
    payment_method: "invoice",
    payment_confirmed: false,
  };
  const deliver = (value) =>
    q("select save_delivery_payment($1,$2)v", [
      JSON.stringify(value),
      driver,
    ]).then((r) => r[0].v);
  assert.equal(o.approved_payment_method, null);
  assert.equal(c.payment_method, "cash");
  await assert.rejects(() => deliver(command), /freigeben/);
  await assert.rejects(
    () => approve("cash", 0, "confirmed", driver),
    /FORBIDDEN/,
  );
  o = await approve("cash", 0, "confirmed", clerk);
  assert.equal(o.requested_payment_method, "invoice");
  assert.equal(o.approved_payment_method, "cash");
  assert.equal(
    (await q("select payment_method from customers where id=$1", [c.id]))[0]
      .payment_method,
    "cash",
  );
  await assert.rejects(() => approve("invoice", 0), /geändert/);
  await assert.rejects(() => deliver(command), /Zahlungsart wurde geändert/);
  await q("update customers set payment_method='invoice' where id=$1", [c.id]);
  await assert.rejects(
    () =>
      deliver({
        ...command,
        expected_payment_method: "cash",
        payment_method: "cash",
      }),
    /Zahlung/,
  );
  const draft = await deliver({
    ...command,
    finalize: false,
    expected_payment_method: "cash",
    payment_method: "cash",
  });
  assert.equal(draft.status, "draft");
  assert.equal(
    (await q("select stock from products where id=$1", [items[0].id]))[0].stock,
    10,
  );
  const finished = {
    ...command,
    revision: draft.revision,
    expected_payment_method: "cash",
    payment_method: "card",
    payment_confirmed: true,
  };
  const d = await deliver(finished);
  await deliver(finished);
  const inv = (
    await q("select * from invoices where delivery_id=$1", [d.id])
  )[0];
  assert.equal(inv.items.length, 1);
  assert.equal(inv.total_cents, 2 * (999 + 240));
  assert.equal(inv.payment_method, "card");
  assert.equal(inv.status, "paid");
  assert.equal(
    (
      await q(
        "select count(*)::int n from invoice_payments where invoice_id=$1",
        [inv.id],
      )
    )[0].n,
    1,
  );
  assert.equal(
    (await q("select stock from products where id=$1", [items[0].id]))[0].stock,
    8,
  );
  assert.equal(
    (await q("select stock from products where id=$1", [items[1].id]))[0].stock,
    10,
  );
  o = (await q("select * from orders where id=$1", [o.id]))[0];
  assert.equal(o.status, "partial");
  assert.equal(o.delivered[items[0].id], 2);
  assert.ok(!o.delivered[items[1].id]);
  await assert.rejects(
    () => q("update deliveries set items='[]' where id=$1", [d.id]),
    /immutable/,
  );
  o = await approve("invoice", o.payment_revision, "partial");
  assert.equal(o.approved_payment_method, "invoice");
  assert.equal(
    (await q("select payment_method from invoices where id=$1", [inv.id]))[0]
      .payment_method,
    "card",
  );
  assert.ok(
    (
      await q(
        "select body from mail_outbox where reference_id=$1 and kind like 'order_schedule_%'",
        [o.id],
      )
    ).some((m) => m.body.includes("Rechnung (bestätigt)")),
  );
  const cfg = (await q("select value from settings where id=1"))[0].value;
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  const printOrder = {
    ...o,
    delivery_date: date,
    eta_start: "10:00",
    eta_end: "10:15",
    route_position: 1,
  };
  await mkdir("output/delivery-corrections", { recursive: true });
  await writeFile(
    "output/delivery-corrections/list.pdf",
    deliveryListPdf([printOrder], date, cfg),
  );
  await writeFile(
    "output/delivery-corrections/list-multipage.pdf",
    deliveryListPdf(
      Array.from({ length: 22 }, (_, i) => ({
        ...printOrder,
        id: crypto.randomUUID(),
        customer_name: `Musterkunde ${i + 1}`,
        number: 100 + i,
      })),
      date,
      cfg,
    ),
  );
  await writeFile(
    "output/delivery-corrections/partial.pdf",
    businessDocument("delivery", d, o, cfg).bytes,
  );
  await writeFile(
    "output/delivery-corrections/fixtures.json",
    JSON.stringify({
      order: printOrder,
      customer: c,
      settings: cfg,
      items,
      delivery: d,
      invoice: inv,
    }),
  );
  console.log(
    "PASS customer payment wish vs staff approval; staff rights, stale revision, snapshot independent of customer edits, unapproved delivery blocked, missing items and draft edits, stock and invoices only for delivered goods, cash/card confirmation, idempotent settlement, immutable completed records and later payment change for remaining delivery. PDF fixtures generated; no external mail.",
  );
} finally {
  await db.close();
}
