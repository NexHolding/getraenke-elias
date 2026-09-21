// Real PostgreSQL semantics in isolation; no production orders or outgoing mail.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const files = (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files.filter((f) => !f.includes("0033_")))
    await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
  const q = async (s, args = []) =>
    JSON.parse(JSON.stringify((await db.query(s, args)).rows));
  const dates = (
    await q(
      `select (now() at time zone 'Europe/Berlin')::date::text today, ((now() at time zone 'Europe/Berlin')::date+1)::text tomorrow`,
    )
  )[0];
  const owner = crypto.randomUUID(),
    cid = crypto.randomUUID();
  await q("insert into auth.users values($1,'owner@example.test')", [owner]);
  await q("insert into staff(user_id,name,role)values($1,'Owner','owner')", [
    owner,
  ]);
  await q(
    "insert into customers(id,name,email,phone,address,street,house_number,postal_code,city)values($1,'Test','test@example.test','01234','Test 1, 74076 Heilbronn','Test','1','74076','Heilbronn')",
    [cid],
  );
  await q("update products set stock=100 where id='elias-036-v1'");
  const create = async (extra = {}) => {
    const row = {
      customer_id: cid,
      customer_name: "Test",
      email: "test@example.test",
      phone: "01234",
      address: "Test",
      items: [],
      status: "confirmed",
      auto_processing: false,
      ...extra,
    };
    return (
      await q(
        `insert into orders(customer_id,customer_name,email,phone,address,items,status,auto_processing,delivery_date,eta_start,requested_delivery_date,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12::timestamptz,now()))returning *`,
        [
          row.customer_id,
          row.customer_name,
          row.email,
          row.phone,
          row.address,
          JSON.stringify(row.items),
          row.status,
          row.auto_processing,
          row.delivery_date ?? null,
          row.eta_start ?? null,
          row.requested_delivery_date ?? null,
          row.created_at ?? null,
        ],
      )
    )[0];
  };
  const invalid = await create({
    delivery_date: dates.today,
    eta_start: "10:20",
  });
  const completed = await create({
    status: "completed",
    delivery_date: dates.today,
    eta_start: "10:20",
  });
  const transit = await create({
    status: "delivering",
    delivery_date: dates.today,
    eta_start: "10:20",
  });
  const oldSub = crypto.randomUUID();
  await q(
    'insert into subscriptions(id,customer_id,items,interval,next_date)values($1,$2,\'[{"id":"elias-036-v1","quantity":4}]\',\'weekly\',$3)',
    [oldSub, cid, dates.today],
  );
  await db.exec(
    await readFile(
      "supabase/migrations/202609170033_delivery_lead_time.sql",
      "utf8",
    ),
  );
  assert.equal(
    (await q("select delivery_date from orders where id=$1", [invalid.id]))[0]
      .delivery_date,
    null,
  );
  for (const o of [completed, transit])
    assert.equal(
      (await q("select eta_start from orders where id=$1", [o.id]))[0]
        .eta_start,
      "10:20",
    );
  assert.equal(
    (
      await q(
        "select count(*)::int n from audit_log where action='delivery_plan_lead_time_corrected'",
      )
    )[0].n,
    1,
  );
  const fresh = await create();
  assert.equal(fresh.requested_delivery_date, null); // No invented customer wish date.
  await assert.rejects(
    () => create({ requested_delivery_date: dates.today }),
    /Folgetag/,
  );
  await assert.rejects(
    () =>
      q("update orders set delivery_date=$1 where id=$2", [
        dates.today,
        fresh.id,
      ]),
    /Folgetag/,
  );
  await q(
    "update orders set delivery_date=$1,eta_start='10:20',eta_end='10:50' where id=$2",
    [dates.tomorrow, fresh.id],
  );
  const older = await create({
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  });
  await assert.rejects(
    () =>
      q("update orders set delivery_date=$1,eta_start='00:00' where id=$2", [
        dates.today,
        older.id,
      ]),
    /Vergangenheit/,
  );
  const draft = {
    request_id: crypto.randomUUID(),
    customer_id: cid,
    items: [{ id: "elias-036-v1", quantity: 4 }],
    delivery_date: dates.today,
    interval: null,
    notes: "",
  };
  await assert.rejects(
    () => q("select create_staff_order($1,$2)", [draft, owner]),
    /Folgetag/,
  );
  await q("select create_staff_order($1,$2)", [
    { ...draft, delivery_date: dates.tomorrow },
    owner,
  ]);
  const sub = {
    id: crypto.randomUUID(),
    request_id: crypto.randomUUID(),
    revision: null,
    customer_id: cid,
    items: draft.items,
    interval: "weekly",
    next_date: dates.today,
    active: true,
    notes: "",
  };
  await assert.rejects(
    () => q("select save_delivery_subscription($1,$2,false)", [sub, owner]),
    /morgen/,
  );
  await q("select save_delivery_subscription($1,$2,false)", [
    { ...sub, next_date: dates.tomorrow },
    owner,
  ]);
  assert.equal((await q("select generate_subscription_orders()n"))[0].n, 2);
  assert.equal((await q("select generate_subscription_orders()n"))[0].n, 0);
  const recurring = await q(
    "select requested_delivery_date::text,recurrence_date::text,subscription_id from orders where subscription_id is not null",
  );
  assert.equal(recurring.length, 2);
  assert.ok(
    recurring.every((o) => o.requested_delivery_date === dates.tomorrow),
  );
  assert.equal(
    recurring.find((o) => o.subscription_id === oldSub).recurrence_date,
    dates.today,
  );
  assert.equal((await q("select count(*)::int n from invoices"))[0].n, 0);
  console.log(
    "PASS migration repairs only unstarted invalid plans; completed and in-transit tours preserved; website and staff next-day guard; past ETA rejection; subscription date guard; tomorrow's subscriptions generated today exactly once; overdue subscription cadence preserved; no invoices.",
  );
} finally {
  await db.close();
}
