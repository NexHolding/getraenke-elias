import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  try {
    await db.exec(
      "begin;" +
        (await readFile("supabase/migrations/" + file, "utf8")) +
        "commit;",
    );
    console.log("Migration OK:", file);
  } catch (e) {
    console.error("Migration FAIL:", file, e.message, e.detail || "");
    process.exit(1);
  }
}
const owner = crypto.randomUUID(),
  staff = crypto.randomUUID();
await db.query("insert into auth.users values($1,$2),($3,$4)", [
  owner,
  "qa-owner@example.test",
  staff,
  "qa-staff@example.test",
]);
await db.query(
  "insert into staff(user_id,role,name,permissions) values($1,'owner','QA owner','[]'),($2,'staff','QA staff','[\"kasse\"]')",
  [owner, staff],
);
const query = async (sql, values = []) => (await db.query(sql, values)).rows;
assert.equal(
  Number((await query("select count(*) n from products where active"))[0].n),
  149,
);
assert.equal(
  (await query("select deposit_cents from products where id='elias-036-v1'"))[0]
    .deposit_cents,
  240,
);
await db.exec(
  "update products set stock=100 where active;update products set stock=1,min_stock=5,target_stock=12,reorder_enabled=true where id='elias-036-v1';update settings set value=value||jsonb_build_object('auto_reorder',true,'reorder_time','00:00','reorder_days',jsonb_build_array(extract(isodow from now() at time zone 'Europe/Berlin')::integer),'reorder_anchor',to_char(now(),'YYYY-MM-DD'));",
);
assert.equal((await query("select generate_reorders() n"))[0].n, 1);
assert.equal((await query("select generate_reorders() n"))[0].n, 0);
await db.exec("update products set stock=100 where id='elias-036-v1'");
const sid = crypto.randomUUID();
const saleArgs = [
  sid,
  JSON.stringify([{ id: "elias-036-v1", quantity: 2 }]),
  "cash",
  owner,
  JSON.stringify([{ deposit_cents: 15, quantity: 5 }]),
  10,
];
const sale = (
  await query("select save_sale($1,$2,$3,$4,$5,$6) result", saleArgs)
)[0].result;
assert.equal(sale.total_cents, 2007);
assert.equal(sale.net_cents + sale.tax_cents, sale.total_cents);
assert.equal(sale.deposit_cents, 405);
await query("select save_sale($1,$2,$3,$4,$5,$6)", saleArgs);
assert.equal(
  (await query("select stock from products where id='elias-036-v1'"))[0].stock,
  98,
);
await assert.rejects(() =>
  query("select save_sale($1,$2,$3,$4,$5,$6)", [
    crypto.randomUUID(),
    saleArgs[1],
    "cash",
    staff,
    "[]",
    10,
  ]),
);
const customer = (
  await query(
    "insert into customers(name,email,phone,address,dropoff_allowed,payment_method) values('QA Customer','qa@example.test','012345678','QA Street 1',true,'invoice') returning id",
  )
)[0].id;
const items = [
  {
    id: "elias-036-v1",
    name: "Alwa Orange",
    quantity: 4,
    price_cents: 890,
    deposit_cents: 240,
    tax_rate: 19,
    deposit_tax_rate: 19,
  },
];
const order = (
  await query(
    "insert into orders(customer_id,customer_name,email,phone,address,items,status,preference_snapshot) values($1,'QA Customer','qa@example.test','012345678','QA Street 1',$2,'confirmed','{\"dropoff_allowed\":true}') returning id",
    [customer, JSON.stringify(items)],
  )
)[0].id;
const did = crypto.randomUUID();
let args = [
  order,
  did,
  JSON.stringify([{ id: "elias-036-v1", quantity: 2 }]),
  0,
  owner,
  false,
  null,
  "",
];
await query("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)", args);
args[5] = true;
args[6] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=";
args[7] = "Abgestellt";
await query("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)", args);
await query("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)", args);
let o = (await query("select * from orders where id=$1", [order]))[0];
assert.equal(o.status, "partial");
assert.equal(o.delivered["elias-036-v1"], 2);
assert.equal(Number((await query("select count(*) n from invoices"))[0].n), 1);
await assert.rejects(() =>
  query("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)", [
    order,
    crypto.randomUUID(),
    JSON.stringify([{ id: "elias-036-v1", quantity: 3 }]),
    0,
    owner,
    true,
    null,
    "Abgestellt",
  ]),
);
await query("select save_delivery($1,$2,$3,$4,$5,$6,$7,$8)", [
  order,
  crypto.randomUUID(),
  JSON.stringify([{ id: "elias-036-v1", quantity: 2 }]),
  0,
  owner,
  true,
  args[6],
  "Empfänger",
]);
o = (await query("select * from orders where id=$1", [order]))[0];
assert.equal(o.status, "completed");
assert.equal(
  (await query("select stock from products where id='elias-036-v1'"))[0].stock,
  94,
);
await query(
  "select close_business_period('day',to_char(now() at time zone 'Europe/Berlin','YYYY-MM-DD'),$1,10000,12007)",
  [owner],
);
const closing = (await query("select totals from closings"))[0].totals;
assert.equal(closing.cash, 2007);
assert.equal(closing.card, 0);
assert.equal(closing.difference, 0);
await query(
  "update customers set street='Äußere Straße',house_number='12 a',postal_code='01234',city='Testort',address='Äußere Straße 12 a, 01234 Testort' where id=$1",
  [customer],
);
await query("update customers set latitude=49,longitude=9 where id=$1", [
  customer,
]);
await query(
  "update customers set street='Neue Straße',address='Neue Straße 12 a, 01234 Testort' where id=$1",
  [customer],
);
assert.equal(
  (await query("select latitude from customers where id=$1", [customer]))[0]
    .latitude,
  null,
);
await query(
  "insert into subscriptions(customer_id,items,interval,next_date) values($1,$2,'weekly',current_date)",
  [customer, JSON.stringify([{ id: "elias-036-v1", quantity: 4 }])],
);
assert.equal((await query("select generate_subscription_orders() n"))[0].n, 1);
assert.equal((await query("select generate_subscription_orders() n"))[0].n, 0);
const recurring = (
  await query(
    "select street,house_number,postal_code,city from orders where subscription_id is not null",
  )
)[0];
assert.deepEqual(recurring, {
  street: "Neue Straße",
  house_number: "12 a",
  postal_code: "01234",
  city: "Testort",
});
console.log(
  "PASS structured address snapshots in recurring orders and invalidated geocodes on address change",
);
for (const fn of [
  "save_sale(uuid,jsonb,text,uuid,jsonb,integer)",
  "save_delivery(uuid,uuid,jsonb,integer,uuid,boolean,text,text)",
  "reset_setup(uuid)",
])
  assert.equal(
    (
      await query(
        "select has_function_privilege('anon',$1,'execute') allowed",
        [fn],
      )
    )[0].allowed,
    false,
  );
await query("select reset_setup($1)", [owner]);
assert.equal(
  (await query("select stock from products where id='elias-036-v1'"))[0].stock,
  100,
);
assert.equal(Number((await query("select count(*) n from sales"))[0].n), 0);
console.log(
  "PASS: all migrations, 149 SKUs, deposits, scheduled reorder deduplication, discount permissions, tax totals, idempotent sales, inventory, partial delivery, overdelivery rejection, final delivery, invoice links, payment summaries, recurring orders, anonymous RPC protection, reversible setup reset.",
);
await db.close();
