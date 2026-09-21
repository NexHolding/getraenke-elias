import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { businessDocument } from "../lib/documents.ts";
import { createFinancePdf } from "../lib/finance-pdf.ts";
import {
  buildFinanceReport,
  financeCsv,
  berlinDate,
} from "../lib/finance-report.ts";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const f of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
const q = async (sql, args = []) =>
  JSON.parse(JSON.stringify((await db.query(sql, args)).rows), (k, v) =>
    k === "due_date" && typeof v === "string" ? v.slice(0, 10) : v,
  );
const owner = crypto.randomUUID(),
  driver = crypto.randomUUID(),
  reader = crypto.randomUUID(),
  user = crypto.randomUUID();
for (const [id, email] of [
  [owner, "owner@test.invalid"],
  [driver, "driver@test.invalid"],
  [reader, "reader@test.invalid"],
  [user, "poststelle@nex-consulting.de"],
])
  await q(
    "insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,$2,now(),$3)",
    [id, email, "private-hash-never-return"],
  );
await q(
  `insert into staff(user_id,name,role,permissions,finance_readonly) values($1,'Inhaber','owner','[]',false),($2,'Fahrer','staff','["lieferung"]',false),($3,'Steuerberater','staff','["finanzen"]',true)`,
  [owner, driver, reader],
);
const c = (
  await q(
    "insert into customers(name,email,address,user_id,payment_method)values('Testkunde','poststelle@nex-consulting.de','Teststraße 1 · Heilbronn',$1,'invoice') returning *",
    [user],
  )
)[0];
assert.equal(
  (await q("select allow_customer_access($1)ok", [c.id]))[0].ok,
  true,
);
assert.equal(
  (await q("select allow_customer_access($1)ok", [c.id]))[0].ok,
  false,
);
const status = (await q("select customer_login_status($1)s", [[c.id]]))[0].s;
assert.equal(status[0].confirmed, true);
assert.equal(status[0].has_password, true);
assert.ok(!JSON.stringify(status).includes("private-hash"));
await q(
  "insert into products(id,sku,name,category,kind,pack_count,volume_ml,price_cents,deposit_cents,stock)values('billing-water','BILL','Testwasser 12 × 0,7 l','Wasser','beverage',12,700,1190,330,100)",
);
const item = {
  id: "billing-water",
  name: "Testwasser 12 × 0,7 l",
  quantity: 2,
  price_cents: 1190,
  deposit_cents: 330,
  tax_rate: 19,
  deposit_tax_rate: 19,
};
async function order() {
  return (
    await q(
      "insert into orders(customer_id,customer_name,email,phone,address,items,status,preference_snapshot)values($1,$2,$3,'0713100000',$4,$5,'confirmed','{\"dropoff_allowed\":true}')returning *",
      [c.id, c.name, c.email, c.address, JSON.stringify([item])],
    )
  )[0];
}
async function deliver(o, extra = {}, actor = driver) {
  const cmd = {
    id: crypto.randomUUID(),
    order_id: o.id,
    items: [{ id: item.id, quantity: 2 }],
    revision: 0,
    finalize: true,
    signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=",
    signed_name: "Testempfänger",
    expected_payment_method: "invoice",
    payment_method: "invoice",
    payment_confirmed: false,
    ...extra,
  };
  return {
    cmd,
    value: (
      await q("select save_delivery_payment($1,$2)d", [
        JSON.stringify(cmd),
        actor,
      ])
    )[0].d,
  };
}
const o = await order();
const ack = (
  await q(
    "select body from mail_outbox where kind='order_ack' and reference_id=$1",
    [o.id],
  )
)[0].body;
assert.match(ack, /2 × Testwasser/);
assert.match(ack, /30,40 EUR/);
assert.match(ack, /Liefertermin/);
await q(
  "update orders set delivery_date=(now() at time zone 'Europe/Berlin')::date+1,eta_start='10:20',eta_end='10:40' where id=$1",
  [o.id],
);
assert.match(
  (
    await q(
      "select body from mail_outbox where kind like 'order_schedule_%' and reference_id=$1",
      [o.id],
    )
  )[0].body,
  /10:20–10:40/,
);
const d = await deliver(o);
const inv = (
  await q("select * from invoices where delivery_id=$1", [d.value.id])
)[0];
assert.equal(inv.status, "open");
assert.equal(inv.payment_terms_days, 14);
assert.equal(inv.payment_method, "invoice");
const deadline = (
  await q("select ((now() at time zone 'Europe/Berlin')::date+14)::text d")
)[0].d;
assert.equal(inv.due_date, deadline);
assert.deepEqual(
  (
    await q("select save_delivery_payment($1,$2)d", [
      JSON.stringify(d.cmd),
      driver,
    ])
  )[0].d,
  d.value,
);
await q(
  "update settings set value=value||'{\"invoice_payment_days\":30}'::jsonb where id=1",
);
assert.equal(
  (await q("select due_date from invoices where id=$1", [inv.id]))[0].due_date,
  deadline,
);
await assert.rejects(
  () => q("update invoices set due_date=due_date+1 where id=$1", [inv.id]),
  /immutable/,
);
await assert.rejects(
  () => q("update invoices set status='paid' where id=$1", [inv.id]),
  /payment booking/,
);
const today = berlinDate(new Date().toISOString());
await assert.rejects(
  () => q("select mark_invoice_paid($1,'bank',$2,$3)", [inv.id, today, driver]),
  /FORBIDDEN/,
);
await assert.rejects(
  () => q("select mark_invoice_paid($1,'bank',$2,$3)", [inv.id, today, reader]),
  /FORBIDDEN/,
);
await q("select mark_invoice_paid($1,'bank',$2,$3)", [inv.id, today, owner]);
await q("select mark_invoice_paid($1,'bank',$2,$3)", [inv.id, today, owner]);
assert.equal(
  (
    await q("select count(*)n from invoice_payments where invoice_id=$1", [
      inv.id,
    ])
  )[0].n,
  1,
);
for (const method of ["cash", "card"]) {
  await q("update customers set payment_method=$1 where id=$2", [method, c.id]);
  const o = await order();
  await assert.rejects(
    () =>
      deliver(o, { expected_payment_method: method, payment_method: method }),
    /Zahlung/,
  );
  assert.equal(
    (await q("select count(*)n from invoices where order_id=$1", [o.id]))[0].n,
    0,
  );
  const done = await deliver(o, {
    expected_payment_method: method,
    payment_method: method,
    payment_confirmed: true,
  });
  const invoice = (
    await q("select * from invoices where delivery_id=$1", [done.value.id])
  )[0];
  assert.equal(invoice.status, "paid");
  assert.equal(invoice.payment_method, method);
  const payments = await q(
    "select * from invoice_payments where invoice_id=$1",
    [invoice.id],
  );
  assert.equal(payments.length, 1);
  assert.equal(payments[0].method, method);
  assert.equal(payments[0].amount_cents, 3040);
  await q("select save_delivery_payment($1,$2)", [
    JSON.stringify(done.cmd),
    driver,
  ]);
  assert.equal(
    (
      await q("select count(*)n from invoice_payments where invoice_id=$1", [
        invoice.id,
      ])
    )[0].n,
    1,
  );
}
await q("update customers set payment_method='invoice' where id=$1", [c.id]);
await q(
  "update settings set value=value||'{\"invoice_payment_days\":14}'::jsonb where id=1",
);
async function agedInvoice(age, mode = "live") {
  const o = await order();
  const delivery = (
    await q(
      "insert into deliveries(order_id,customer_id,items,actor,status)values($1,$2,$3,$4,'draft')returning id",
      [o.id, c.id, JSON.stringify([item]), driver],
    )
  )[0].id;
  return (
    await q(
      "insert into invoices(order_id,delivery_id,customer_id,customer_snapshot,items,total_cents,net_cents,tax_cents,deposit_cents,created_at,mode)values($1,$2,$3,$4,$5,3040,2555,485,660,now()-($6||' days')::interval,$7)returning *",
      [
        o.id,
        delivery,
        c.id,
        JSON.stringify({ name: c.name, email: c.email, address: c.address }),
        JSON.stringify([item]),
        String(age),
        mode,
      ],
    )
  )[0];
}
const overdue = await agedInvoice(15);
const dueToday = await agedInvoice(14);
const setup = await agedInvoice(99, "setup");
assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 1);
assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 0);
assert.equal(
  (
    await q(
      "select count(*)n from invoice_reminders where invoice_id=any($1)",
      [[dueToday.id, setup.id]],
    )
  )[0].n,
  0,
);
const reminder = (
  await q(
    "select r.*,m.body from invoice_reminders r join mail_outbox m on m.id=r.mail_id where invoice_id=$1",
    [overdue.id],
  )
)[0];
assert.match(reminder.body, /1/);
assert.equal(
  (
    await q(
      "select count(*)n from customer_communications where kind='invoice_reminder_1' and customer_id=$1",
      [c.id],
    )
  )[0].n,
  1,
);
for (const stage of [1, 2]) {
  await q(
    "update mail_outbox set status='sent',sent_at=now()-interval '6 days' where kind=$1 and reference_id=$2",
    ["invoice_reminder_" + stage, overdue.id],
  );
  assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 0);
  await q(
    "update mail_outbox set sent_at=now()-interval '7 days' where kind=$1 and reference_id=$2",
    ["invoice_reminder_" + stage, overdue.id],
  );
  assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 1);
}
await q(
  "update mail_outbox set status='sent',sent_at=now()-interval '7 days' where kind='invoice_reminder_3' and reference_id=$1",
  [overdue.id],
);
assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 0);
const stop = await agedInvoice(15);
await q("select queue_invoice_reminders()");
await q("select mark_invoice_paid($1,'bank',$2,$3)", [stop.id, today, owner]);
assert.equal(
  (
    await q(
      "select status from mail_outbox where kind='invoice_reminder_1' and reference_id=$1",
      [stop.id],
    )
  )[0].status,
  "failed",
);
assert.equal((await q("select queue_invoice_reminders()n"))[0].n, 0);
const settings = (await q("select value from settings where id=1"))[0].value;
const paid = (await q("select * from invoices where id=$1", [inv.id]))[0];
const payment = (
  await q("select * from invoice_payments where invoice_id=$1", [inv.id])
)[0];
// Payment in a later reporting period must not produce invoice revenue a second time.
const later = { ...payment, paid_at: "2026-10-10T12:00:00Z" },
  earlier = { ...paid, created_at: "2026-09-28T12:00:00Z" };
const september = buildFinanceReport(
  [],
  [earlier],
  "2026-09",
  settings,
  [],
  undefined,
  [later],
);
const october = buildFinanceReport(
  [],
  [earlier],
  "2026-10",
  settings,
  [],
  undefined,
  [later],
);
assert.equal(september.all.invoices, 3040);
assert.equal(october.all.gross, 0);
assert.equal(october.received.bank, 3040);
assert.match(financeCsv(october), /Zahlungseingang Lieferrechnung/);
for (const f of [
  "queue_invoice_reminders()",
  "mark_invoice_paid(uuid,text,date,uuid)",
  "customer_login_status(uuid[])",
  "save_delivery_payment(jsonb,uuid)",
])
  assert.equal(
    (
      await q("select has_function_privilege('authenticated',$1,'execute')ok", [
        f,
      ])
    )[0].ok,
    false,
  );
await mkdir("output/billing", { recursive: true });
await writeFile(
  "output/billing/invoice.pdf",
  businessDocument("invoice", inv, o, settings).bytes,
);
await writeFile(
  "output/billing/payment-report.pdf",
  Buffer.from((await createFinancePdf(october)).output("arraybuffer")),
);
await writeFile(
  "output/billing/fixtures.json",
  JSON.stringify({
    customer: { ...c, online_account: status[0] },
    invoice: inv,
    paid,
    overdue: { ...overdue, reminder_stage: 3, reminder_status: "sent" },
    payment,
    settings,
    order: o,
  }),
);
console.log(
  "PASS: login metadata without hashes; detailed acknowledgements and schedule mail; immutable due dates; delivery cash/card confirmation; owner-only idempotent payments; three staged reminders with sent-date spacing, setup exclusion and payment stop; cross-month accounting and PDFs.",
);
await db.close();
