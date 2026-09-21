import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { totals } from "../lib/money.ts";
import { businessDocument } from "../lib/documents.ts";
import { buildFinanceReport, berlinDate } from "../lib/finance-report.ts";
import { receiptLogo as signature } from "../lib/receipt-logo.ts";
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
  const actor = crypto.randomUUID();
  await q("insert into auth.users values($1,$2)", [
    actor,
    "driver@example.test",
  ]);
  await q(
    `insert into staff(user_id,name,role,permissions)values($1,'QA Fahrer','staff','["lieferung"]')`,
    [actor],
  );
  const c = (
    await q(
      `insert into customers(name,email,address,payment_method,dropoff_allowed)values('Pfand-Testkunde','qa@example.test','Teststraße 1, 74076 Heilbronn','invoice',true)returning *`,
    )
  )[0];
  await q("update products set stock=100 where id='elias-036-v1'");
  const item = {
    id: "elias-036-v1",
    name: "Testgetränk",
    quantity: 2,
    price_cents: 999,
    deposit_cents: 240,
    tax_rate: 7,
    deposit_tax_rate: 19,
  };
  const order = async (pref = "invoice") =>
    (
      await q(
        `insert into orders(customer_id,customer_name,email,phone,address,items,status,approved_payment_method,preference_snapshot)values($1,$2,$3,'071310000',$4,$5,'confirmed',$6,'{"dropoff_allowed":true}')returning *`,
        [c.id, c.name, c.email, c.address, JSON.stringify([item]), pref],
      )
    )[0];
  const command = (o, method = "invoice") => ({
    id: crypto.randomUUID(),
    order_id: o.id,
    revision: 0,
    items: [{ id: item.id, quantity: 2 }],
    finalize: true,
    signature,
    signed_name: "Testempfänger",
    expected_payment_method: o.approved_payment_method,
    payment_method: method,
    payment_confirmed: false,
    returns: [
      { deposit_cents: 330, quantity: 1 },
      { deposit_cents: 25, quantity: 3 },
    ],
  });
  const deliver = async (v) =>
    (
      await q("select save_delivery_payment($1,$2)d", [
        JSON.stringify(v),
        actor,
      ])
    )[0].d;
  const o = await order();
  let cmd = command(o, "cash");
  await assert.rejects(
    () => deliver({ ...cmd, signature: null, payment_confirmed: true }),
    /Kundenunterschrift/,
  );
  await assert.rejects(
    () => deliver({ ...cmd, signature: "" }),
    /Kundenunterschrift/,
  );
  await assert.rejects(() => deliver(cmd), /bestätigen/);
  for (const returns of [
    [{ deposit_cents: 26, quantity: 1 }],
    [{ deposit_cents: 25, quantity: 1.5 }],
    [{ deposit_cents: 25, quantity: 1001 }],
    [{ deposit_cents: 25, quantity: -1 }],
    [
      { deposit_cents: 25, quantity: 1 },
      { deposit_cents: 25, quantity: 2 },
    ],
  ])
    await assert.rejects(
      () => deliver({ ...cmd, returns, payment_confirmed: true }),
      /Pfand/,
    );
  assert.equal((await q("select count(*)::int n from invoices"))[0].n, 0);
  const draft = await deliver({ ...cmd, finalize: false, signature: null });
  assert.equal(draft.total_cents, 2073);
  assert.equal(draft.deposit_returns.length, 2);
  assert.equal(
    (await q("select stock from products where id=$1", [item.id]))[0].stock,
    100,
  );
  const staleClient = { ...cmd, finalize: false, revision: draft.revision };
  delete staleClient.returns;
  await assert.rejects(() => deliver(staleClient), /neu öffnen/);
  const updated = await deliver({
    ...cmd,
    finalize: false,
    revision: draft.revision,
    returns: [{ deposit_cents: 330, quantity: 2 }],
  });
  assert.equal(updated.total_cents, 1818);
  await assert.rejects(
    () =>
      deliver({ ...cmd, revision: draft.revision, payment_confirmed: true }),
    /Revision/,
  );
  cmd = { ...cmd, revision: updated.revision, payment_confirmed: true };
  const d = await deliver(cmd);
  assert.equal(d.total_cents, 2073);
  assert.equal(d.items.length, 1);
  await deliver(cmd);
  let invoice = (
    await q("select * from invoices where delivery_id=$1", [d.id])
  )[0];
  assert.equal(invoice.payment_method, "cash");
  assert.equal(invoice.status, "paid");
  assert.equal(invoice.total_cents, 2073);
  assert.equal(invoice.items.length, 3);
  assert.equal(totals(invoice.items).net, invoice.net_cents);
  assert.equal(totals(invoice.items).deposit, invoice.deposit_cents);
  assert.equal(
    (
      await q(
        "select count(*)::int n from invoice_payments where invoice_id=$1",
        [invoice.id],
      )
    )[0].n,
    1,
  );
  assert.equal(
    (await q("select stock from products where id=$1", [item.id]))[0].stock,
    98,
  );
  await assert.rejects(
    () => q("update deliveries set deposit_returns='[]' where id=$1", [d.id]),
    /immutable/,
  );
  await assert.rejects(
    () => q("update invoices set total_cents=0 where id=$1", [invoice.id]),
    /immutable/,
  );
  for (const method of ["invoice", "card"]) {
    const x = command(await order(), method);
    await assert.rejects(
      () => deliver({ ...x, signature: null, payment_confirmed: true }),
      /Kundenunterschrift/,
    );
    const out = await deliver({ ...x, payment_confirmed: true });
    const inv = (
      await q("select * from invoices where delivery_id=$1", [out.id])
    )[0];
    assert.equal(inv.payment_method, method);
    assert.equal(inv.status, method === "invoice" ? "open" : "paid");
    assert.equal(inv.total_cents, 2073);
  }
  const cashOrder = await order("cash");
  await assert.rejects(
    () => deliver(command(cashOrder, "invoice")),
    /freigegeben/,
  );
  const negative = command(await order(), "invoice");
  negative.returns = [{ deposit_cents: 330, quantity: 10 }];
  await assert.rejects(() => deliver(negative), /auszahlen/);
  const refund = await deliver({
    ...negative,
    payment_method: "cash",
    payment_confirmed: true,
  });
  assert.equal(refund.total_cents, -822);
  const refundInvoice = (
    await q("select * from invoices where delivery_id=$1", [refund.id])
  )[0];
  assert.equal(
    (
      await q("select amount_cents from invoice_payments where invoice_id=$1", [
        refundInvoice.id,
      ])
    )[0].amount_cents,
    -822,
  );
  const zero = command(await order());
  zero.returns = [
    { deposit_cents: 8, quantity: 1 },
    { deposit_cents: 15, quantity: 98 },
    { deposit_cents: 25, quantity: 40 },
  ];
  assert.equal(
    zero.returns.reduce((s, r) => s + r.deposit_cents * r.quantity, 0),
    2478,
  );
  const zerod = await deliver(zero);
  const zeroi = (
    await q("select * from invoices where delivery_id=$1", [zerod.id])
  )[0];
  assert.equal(zeroi.total_cents, 0);
  assert.equal(zeroi.status, "paid");
  assert.equal(
    (
      await q(
        "select count(*)::int n from invoice_payments where invoice_id=$1",
        [zeroi.id],
      )
    )[0].n,
    0,
  );
  const cfg = (await q("select value from settings where id=1"))[0].value;
  const allInvoices = await q("select * from invoices");
  const allPayments = await q("select * from invoice_payments");
  const report = buildFinanceReport(
    [],
    allInvoices,
    berlinDate(invoice.created_at),
    cfg,
    [],
    new Date().toISOString(),
    allPayments,
  );
  assert.equal(
    report.all.gross,
    allInvoices.reduce((s, i) => s + i.total_cents, 0),
  );
  await mkdir("output/delivery-returns", { recursive: true });
  for (const [name, kind, record, ord] of [
    ["delivery", "delivery", d, o],
    ["invoice", "invoice", invoice, o],
    [
      "refund",
      "invoice",
      refundInvoice,
      await q("select * from orders where id=$1", [negative.order_id]).then(
        (r) => r[0],
      ),
    ],
  ])
    await writeFile(
      `output/delivery-returns/${name}.pdf`,
      businessDocument(kind, record, ord, cfg).bytes,
    );
  await writeFile(
    "output/delivery-returns/fixtures.json",
    JSON.stringify({
      delivery: d,
      invoice,
      order: o,
      customer: c,
      settings: cfg,
    }),
  );
  console.log(
    "PASS mandatory signature for all payment methods and dropoff customers; invoice-to-cash/card; unauthorized invoice credit rejected; identical deposit types, validation, draft persistence/revision, exact mixed VAT totals and signed refunds; immutable invoice/delivery, one stock/payment/mail operation on retry; zero settlement; finance totals and PDF fixtures. No production writes or email.",
  );
} finally {
  await db.close();
}
