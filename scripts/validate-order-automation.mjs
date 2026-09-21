import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  for (const f of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const q = async (s, a = []) =>
    JSON.parse(JSON.stringify((await db.query(s, a)).rows));
  const owner = crypto.randomUUID(),
    driver = crypto.randomUUID(),
    finance = crypto.randomUUID(),
    customer = crypto.randomUUID();
  for (const id of [owner, driver, finance, customer])
    await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    `insert into staff(user_id,name,role,permissions,finance_readonly)values($1,'Owner','owner','[]',false),($2,'Driver','staff','["lieferung"]',false),($3,'Finance','staff','["finanzen"]',true)`,
    [owner, driver, finance],
  );
  const cid = (
    await q(
      `insert into customers(name,email,address,user_id)values('Testkunde','test@example.test','Teststraße 1',$1)returning id`,
      [customer],
    )
  )[0].id;
  for (const [id, stock, active] of [
    ["stock-a", 5, true],
    ["stock-b", null, true],
    ["stock-c", 20, false],
    ["stock-d", 100, true],
  ])
    await q(
      `insert into products(id,sku,name,category,stock,active,price_cents,deposit_cents,pack_count,volume_ml)values($1,$1,$1,'Wasser',$2,$3,1000,330,12,700)`,
      [id, stock, active],
    );
  const create = async (
    product = "stock-a",
    quantity = 4,
    method = "cash",
    extra = {},
  ) => {
    const record = {
      customer_id: cid,
      customer_name: "Testkunde",
      email: "test@example.test",
      phone: "071310000",
      address: "Teststraße 1",
      items: [
        {
          id: product,
          name: product,
          quantity,
          price_cents: 1000,
          deposit_cents: 330,
          tax_rate: 19,
          deposit_tax_rate: 19,
        },
      ],
      requested_payment_method: method,
      ...extra,
    };
    return (
      await q(
        `insert into orders(customer_id,customer_name,email,phone,address,items,requested_payment_method,approved_payment_method,auto_processing,status)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)returning *`,
        [
          record.customer_id,
          record.customer_name,
          record.email,
          record.phone,
          record.address,
          JSON.stringify(record.items),
          record.requested_payment_method,
          record.approved_payment_method || null,
          record.auto_processing ?? true,
          record.status || "new",
        ],
      )
    )[0];
  };
  const first = await create();
  assert.equal(first.status, "confirmed");
  assert.ok(first.auto_confirmed_at);
  assert.equal(first.approved_payment_method, "cash");
  assert.equal(
    (await q("select stock from products where id='stock-a'"))[0].stock,
    5,
  );
  const second = await create();
  assert.equal(second.status, "new");
  assert.equal(second.stock_check[0].reserved, 4);
  assert.equal(second.stock_check[0].available, 1);
  assert.equal(second.stock_check[0].missing, 3);
  const unknown = await create("stock-b");
  assert.equal(unknown.status, "new");
  assert.equal(unknown.stock_check[0].state, "unknown");
  const inactive = await create("stock-c");
  assert.equal(inactive.stock_check[0].state, "inactive");
  assert.equal(inactive.status, "new");
  const invoice = await create("stock-d", 4, "invoice");
  assert.equal(invoice.status, "confirmed");
  assert.equal(invoice.approved_payment_method, null);
  const knownInvoice = await create("stock-d", 4, "invoice", {
    approved_payment_method: "invoice",
  });
  assert.equal(knownInvoice.status, "confirmed");
  assert.equal(knownInvoice.approved_payment_method, "invoice");
  const legacy = await create("stock-d", 4, "card", { auto_processing: false });
  assert.equal(legacy.status, "new");
  assert.equal(
    (
      await q(
        "select count(*)::int n from order_inbox_events where order_id=$1",
        [legacy.id],
      )
    )[0].n,
    0,
  );
  const getInbox = async (actor) =>
    (await q("select read_order_inbox($1)v", [actor]))[0].v;
  const unread = await getInbox(owner);
  assert.equal(unread.orders.length, 6);
  assert.equal((await getInbox(driver)).orders.length, 6);
  await assert.rejects(() => getInbox(finance), /FORBIDDEN/);
  await assert.rejects(() => getInbox(customer), /FORBIDDEN/);
  await q("select acknowledge_order_inbox($1,$2)", [first.id, owner]);
  await q("select acknowledge_order_inbox($1,$2)", [first.id, owner]);
  assert.equal((await getInbox(owner)).orders.length, 5);
  assert.equal((await getInbox(driver)).orders.length, 6);
  assert.equal((await q("select process_order_automation()n"))[0].n, 0);
  await q("update products set stock=8 where id='stock-a'");
  assert.equal((await q("select process_order_automation()n"))[0].n, 1);
  let filled = (await q("select * from orders where id=$1", [second.id]))[0];
  assert.equal(filled.status, "confirmed");
  assert.equal(filled.stock_check[0].available, 4);
  assert.equal(filled.payment_revision, 1);
  const version = (await getInbox(owner)).revision;
  const mailCount = (await q("select count(*)::int n from mail_outbox"))[0].n;
  assert.equal((await q("select process_order_automation()n"))[0].n, 0);
  assert.equal(
    (await q("select count(*)::int n from mail_outbox"))[0].n,
    mailCount,
  );
  assert.equal((await getInbox(owner)).revision, version);
  const third = await create();
  assert.equal(third.status, "new");
  await q("update orders set status='cancelled' where id=$1", [first.id]);
  assert.equal((await q("select process_order_automation()n"))[0].n, 1);
  assert.equal(
    (await q("select status from orders where id=$1", [third.id]))[0].status,
    "confirmed",
  );
  // A partial delivery consumes physical stock and reduces only the remaining commitment.
  await q("update products set stock=6 where id='stock-a'");
  await q(
    "update orders set status='partial',delivered=jsonb_build_object('stock-a',2) where id=$1",
    [second.id],
  );
  const afterPartial = await create("stock-a", 1);
  assert.equal(afterPartial.status, "new");
  assert.equal(afterPartial.stock_check[0].reserved, 6);
  assert.equal(afterPartial.stock_check[0].missing, 1);
  await q("update orders set status='completed' where id=$1", [second.id]);
  assert.equal((await q("select process_order_automation()n"))[0].n, 1);
  const today = (
    await q("select to_char(now() at time zone 'Europe/Berlin','YYYY-MM-DD')v")
  )[0].v;
  await q(
    "update orders set created_at=now()-interval '2 days',requested_delivery_date=$1,delivery_date=$1 where id=any($2::uuid[])",
    [today, [third.id, invoice.id, knownInvoice.id]],
  );
  const start = async (actor, date = today) =>
    (await q("select start_delivery_tour($1,$2)v", [date, actor]))[0].v;
  await assert.rejects(() => start(finance), /FORBIDDEN/);
  await assert.rejects(() => start(driver, "2030-01-01"), /Liefertag/);
  let result = await start(driver);
  assert.equal(result.started, 2);
  assert.equal(result.payment_pending, 1);
  assert.equal((await start(driver)).started, 0);
  const started = (await q("select * from orders where id=$1", [third.id]))[0];
  assert.equal(started.status, "delivering");
  assert.equal(started.delivery_started_by, driver);
  assert.ok(started.delivery_started_at);
  assert.equal(
    (await q("select status from orders where id=$1", [invoice.id]))[0].status,
    "confirmed",
  );
  await q("update orders set status='completed' where id=$1", [third.id]);
  await start(driver);
  assert.equal(
    (await q("select status from orders where id=$1", [third.id]))[0].status,
    "completed",
  );
  assert.equal((await q("select count(*)::int n from invoices"))[0].n, 0);
  assert.equal(
    (await q("select count(*)::int n from stock_movements"))[0].n,
    0,
  );
  for (const fn of [
    "process_order_automation()",
    "start_delivery_tour(date,uuid)",
    "read_order_inbox(uuid)",
    "acknowledge_order_inbox(uuid,uuid)",
    "order_stock_check(jsonb,jsonb,uuid)",
  ])
    assert.equal(
      (await q("select has_function_privilege('anon',$1,'execute')v", [fn]))[0]
        .v,
      false,
    );
  console.log(
    "PASS automatic stock confirmation; committed/partial quantities; unknown/inactive stock; invoice credit boundary; FIFO recheck after stock and cancellation; no duplicate mail; per-user persistent inbox and role isolation; actual tour start, day guard, payment hold, replay, terminal statuses; no inventory or accounting mutation.",
  );
} finally {
  await db.close();
}
