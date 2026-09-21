import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildCashBookReport, cashBookCsv } from "../lib/cash-book.ts";
import { createCashBookPdf, appendCashBookPdf } from "../lib/cash-book-pdf.ts";
import { buildFinanceReport, financeCsv } from "../lib/finance-report.ts";
import { createFinancePdf } from "../lib/finance-pdf.ts";
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
    employee = crypto.randomUUID(),
    accountant = crypto.randomUUID(),
    stranger = crypto.randomUUID();
  for (const id of [owner, employee, accountant, stranger])
    await q("insert into auth.users values($1,$2)", [id, id + "@example.test"]);
  await q(
    `insert into staff(user_id,name,role,permissions,finance_readonly)values($1,'Inhaber','owner','[]',false),($2,'Mitarbeiterin','staff','["kasse"]',false),($3,'Steuerberater','staff','["finanzen","kasse"]',true)`,
    [owner, employee, accountant],
  );
  const command = async (v, actor = employee) =>
    (
      await q("select cash_book_command($1::jsonb,$2) result", [
        JSON.stringify(v),
        actor,
      ])
    )[0].result;
  const cmd = (v) => ({ request_id: crypto.randomUUID(), ...v });
  const opening = cmd({ action: "open", opening_cents: 25000 });
  await assert.rejects(() => command(opening, accountant), /FORBIDDEN/);
  await assert.rejects(() => command(opening, stranger), /FORBIDDEN/);
  const d = await command(opening);
  assert.equal(d.opening_cents, 25000);
  assert.equal((await command(opening)).id, d.id);
  await assert.rejects(
    () => command({ ...opening, opening_cents: 30000 }),
    /Vorgangskennung/,
  );
  const movement = cmd({
    action: "movement",
    day_id: d.id,
    amount_cents: -1000,
    description: "Porto bei Edeka",
    category: "Betriebsausgabe",
    reference: "ED-001",
    document_date: d.day,
  });
  const m = await command(movement);
  assert.equal(m.balance_cents, 24000);
  assert.equal((await command(movement)).id, m.id);
  await assert.rejects(
    () =>
      command(
        cmd({
          ...movement,
          request_id: crypto.randomUUID(),
          amount_cents: -30000,
        }),
      ),
    /Nicht genügend/,
  );
  await assert.rejects(
    () =>
      command(
        cmd({ ...movement, request_id: crypto.randomUUID(), reference: "" }),
      ),
    /Beleg/,
  );
  const receipt = Buffer.from("%PDF-1.4\nTest attachment");
  const attached = await command(
    cmd({
      ...movement,
      request_id: crypto.randomUUID(),
      description: "Verpackungsmaterial",
      amount_cents: -500,
      document: {
        filename: "Beleg.pdf",
        mime: "application/pdf",
        base64: receipt.toString("base64"),
        sha256: createHash("sha256").update(receipt).digest("hex"),
      },
    }),
  );
  assert.equal(attached.has_document, true);
  assert.equal((await q("select count(*)::int n from cash_documents"))[0].n, 1);
  await assert.rejects(
    () => q("update cash_entries set amount_cents=0 where id=$1", [m.id]),
    /festgeschrieben/,
  );
  await assert.rejects(
    () => q("delete from cash_documents where entry_id=$1", [attached.id]),
    /festgeschrieben/,
  );
  // Trigger integration: cash sale + cash refund affect the drawer; card does not.
  const sale = async (payment, total) => {
    const id = crypto.randomUUID();
    await q(
      `insert into sales(id,items,total_cents,net_cents,tax_cents,deposit_cents,payment,actor,actor_name)values($1,$2,$3,$3,0,0,$4,$5,'Mitarbeiterin')`,
      [
        id,
        JSON.stringify([
          {
            id: "qa",
            name: "Testware",
            quantity: total < 0 ? -1 : 1,
            price_cents: Math.abs(total),
            deposit_cents: 0,
            tax_rate: 0,
            deposit_tax_rate: 0,
          },
        ]),
        total,
        payment,
        employee,
      ],
    );
    return id;
  };
  await sale("cash", 10000);
  await sale("card", 9000);
  await sale("cash", -2000);
  assert.equal(
    (
      await q(
        "select balance_cents from cash_entries order by number desc limit 1",
      )
    )[0].balance_cents,
    31500,
  );
  const reverse = await command(
    cmd({
      action: "reverse",
      day_id: d.id,
      entry_id: m.id,
      note: "Ausgabe versehentlich doppelt erfasst",
    }),
  );
  assert.equal(reverse.amount_cents, 1000);
  assert.equal(reverse.balance_cents, 32500);
  await assert.rejects(
    () =>
      command(
        cmd({
          action: "reverse",
          day_id: d.id,
          entry_id: m.id,
          note: "Nochmal",
        }),
      ),
    /erneut/,
  );
  // Driver cash stays separate until an explicit, idempotent drawer handover.
  const orderId = crypto.randomUUID();
  await q(
    "insert into products(id,sku,name,category,price_cents,deposit_cents,pack_count,volume_ml)values('cash-water','CASH-W','Testwasser','Wasser',1500,0,1,1000)",
  );
  await q(
    "insert into orders(id,customer_name,email,phone,address,items,status,auto_processing,approved_payment_method)values($1,'Testkunde','test@example.test','0713100000','Teststraße 1',$2,'confirmed',false,'cash')",
    [
      orderId,
      JSON.stringify([
        {
          id: "cash-water",
          name: "Testwasser",
          quantity: 1,
          price_cents: 1500,
          deposit_cents: 0,
          tax_rate: 19,
          deposit_tax_rate: 19,
        },
      ]),
    ],
  );
  await q("select save_delivery_payment($1,$2)", [
    JSON.stringify({
      id: crypto.randomUUID(),
      order_id: orderId,
      items: [{ id: "cash-water", quantity: 1 }],
      revision: 0,
      finalize: true,
      signature:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOuoAAAAASUVORK5CYII=",
      signed_name: "Testkunde",
      expected_payment_method: "cash",
      payment_method: "cash",
      payment_confirmed: true,
    }),
    owner,
  ]);
  const payment = (await q("select * from invoice_payments"))[0];
  assert.equal(payment.amount_cents, 1500);
  assert.equal(
    (
      await q(
        "select balance_cents from cash_entries order by number desc limit 1",
      )
    )[0].balance_cents,
    32500,
  );
  const handover = cmd({
    action: "delivery-transfer",
    day_id: d.id,
    payment_id: payment.id,
  });
  assert.equal((await command(handover)).balance_cents, 34000);
  assert.equal((await command(handover)).balance_cents, 34000);
  await assert.rejects(
    () =>
      command(
        cmd({
          action: "delivery-transfer",
          day_id: d.id,
          payment_id: payment.id,
        }),
      ),
    /bereits übernommen/,
  );
  await command(
    cmd({
      action: "movement",
      day_id: d.id,
      amount_cents: -1500,
      description: "Liefergeld in Tresor",
      category: "Bank / Tresor",
      document_date: d.day,
    }),
  );
  // Stale close is rejected even when subsequent cash movements net to zero.
  let revision = (
    await q("select max(number) n from cash_entries where day_id=$1", [d.id])
  )[0].n;
  const close = cmd({
    action: "close",
    day_id: d.id,
    revision,
    counted_cents: 32000,
    next_opening_cents: 25000,
    transfer_note: "Tresor",
    note: "Zählung nach Ladenschluss",
    confirmed: true,
  });
  await command(
    cmd({
      action: "movement",
      day_id: d.id,
      amount_cents: 100,
      description: "Wechselgeld",
      category: "Privateinlage",
      document_date: d.day,
    }),
  );
  await command(
    cmd({
      action: "movement",
      day_id: d.id,
      amount_cents: -100,
      description: "Wechselgeld zurück",
      category: "Privatentnahme",
      document_date: d.day,
    }),
  );
  await assert.rejects(() => command(close), /neue Buchungen/);
  close.revision = (
    await q("select max(number) n from cash_entries where day_id=$1", [d.id])
  )[0].n;
  const finished = await command(close);
  assert.equal(finished.expected_cents, 32500);
  assert.equal(finished.counted_cents, 32000);
  assert.equal(finished.difference_cents, -500);
  assert.equal(finished.next_opening_cents, 25000);
  assert.deepEqual(await command(close), finished);
  assert.equal(
    (
      await q(
        "select balance_cents from cash_entries order by number desc limit 1",
      )
    )[0].balance_cents,
    25000,
  );
  await assert.rejects(() => sale("cash", 1000), /Tageskasse/);
  await assert.rejects(() => sale("card", 1000), /Tageskasse/);
  await assert.rejects(
    () => q("update cash_days set counted_cents=1 where id=$1", [d.id]),
    /abgeschlossen/,
  );
  await assert.rejects(
    () => q("select reset_setup($1)", [owner]),
    /Kassenbuch/,
  );
  await assert.rejects(
    () => command(cmd({ action: "open", opening_cents: 25000 })),
    /heutige/,
  );
  await assert.rejects(()=>q("delete from sales where payment='cash'"),/Kassenbuch/);
  await assert.rejects(()=>q("delete from invoice_payments where id=$1",[payment.id]),/Kassenbuch/);
  // Simulate a prior business day only inside this isolated DB to verify carry-forward.
  await db.exec("alter table cash_days disable trigger cash_days_protect");
  await q(`update cash_days set day=day-1 where id=$1`, [d.id]);
  await db.exec("alter table cash_days enable trigger cash_days_protect");
  await assert.rejects(
    () => command(cmd({ action: "open", opening_cents: 26000 })),
    /Abweichung/,
  );
  // Prior-day receipts are fixture-shifted too, so opening does not re-import today.
  await db.exec("alter table sales disable trigger user");
  await q(`update sales set created_at=created_at-interval '1 day'`);
  await db.exec("alter table sales enable trigger user");
  const second = await command(cmd({ action: "open", opening_cents: 25000 }));
  assert.equal(
    (
      await q(
        "select balance_cents from cash_entries order by number desc limit 1",
      )
    )[0].balance_cents,
    25000,
  );
  const revision2 = (
    await q("select max(number) n from cash_entries where day_id=$1", [
      second.id,
    ])
  )[0].n;
  await command(
    cmd({
      action: "close",
      day_id: second.id,
      revision: revision2,
      counted_cents: 25000,
      next_opening_cents: 25000,
      confirmed: true,
    }),
  );
  const days = await q("select * from cash_days order by day");
  const entries = await q("select * from cash_entries order by number");
  const period = d.day.slice(0, 7);
  const report = buildCashBookReport(days, entries, period);
  assert.equal(report.ending, 25000);
  assert.equal(report.income - report.expenses + report.opening, report.ending);
  assert.equal(report.difference, -500);
  const csv = cashBookCsv(report);
  assert.match(csv, /Porto bei Edeka/);
  assert.match(csv, /Steuerberater|Mitarbeiterin/);
  const settings = {
    business_name: "Getränkeshop Elias · Frank Elias",
    business_address: "Wartbergstraße 3 · 74076 Heilbronn",
    tax_number: "TESTBELEG",
    live_mode: false,
  };
  const sales = await q("select * from sales order by number");
  const finance = buildFinanceReport(sales, [], period, settings);
  const baseCsv = financeCsv(finance);
  const combined = financeCsv(finance, report);
  assert.ok(!baseCsv.includes("Kassenbuch KB-Nummer"));
  assert.ok(combined.includes("Kassenbuch KB-Nummer"));
  assert.equal(finance.all.gross, 17000);
  await mkdir("output/cash-book", { recursive: true });
  const pdf = await createCashBookPdf(report, settings);
  await writeFile(
    "output/cash-book/Elias-Kassenbuch-Monat.pdf",
    Buffer.from(pdf.output("arraybuffer")),
  );
  const daily = buildCashBookReport(days, entries, days[0].day);
  const dailyPdf = await createCashBookPdf(daily, settings);
  await writeFile(
    "output/cash-book/Elias-Kassenbuch-Tag.pdf",
    Buffer.from(dailyPdf.output("arraybuffer")),
  );
  const financePdf = await createFinancePdf(finance);
  const beforePages = financePdf.getNumberOfPages();
  await appendCashBookPdf(financePdf, report, settings);
  assert.ok(financePdf.getNumberOfPages() > beforePages);
  await writeFile(
    "output/cash-book/Elias-Monatsbericht-mit-Kassenbuch.pdf",
    Buffer.from(financePdf.output("arraybuffer")),
  );
  await writeFile("output/cash-book/Kassenbuch.csv", csv);
  await writeFile("output/cash-book/Finanzen-mit-Kassenbuch.csv", combined);
  await writeFile(
    "output/cash-book/fixtures.json",
    JSON.stringify({
      report,
      allDays: days,
      settings,
      entries,
      finished,
      day: second,
      pending: [],
      readOnly: false,
    }),
  );
  await db.exec("set role anon");
  await assert.rejects(
    () => q("select * from cash_entries"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      q("select cash_book_command($1,$2)", [JSON.stringify(opening), owner]),
    /permission denied/,
  );
  await db.exec("reset role");
  await db.exec("set role service_role");
  await assert.rejects(
    () => q("update cash_days set opening_cents=1"),
    /permission denied/,
  );
  await assert.rejects(
    () => q("select cash_write($1,'manual',1,'Bad',$2)", [second.id, owner]),
    /permission denied/,
  );
  await db.exec("reset role");
  console.log(
    "PASS cash book: employee opening; accountant/stranger writes denied; cash sales/refunds automatic, card excluded; expenses with attachments; balance guards; immutable journal; reversal and replay; stale closing rejected; discrepancy and actual float transfer; next-day carry without duplication; day/month PDF and CSV with optional finance appendix; no anonymous access or direct writes.",
  );
} finally {
  await db.close();
}
