// UI + real PDF rasterizer against simulated Epson/receipt APIs; never writes shop data.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { createReceiptPdf } from "../lib/receipt.ts";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
process.loadEnvFile(".env.local");
const base = "http://127.0.0.1:3017";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
let auth;
await mkdir("output/epson", { recursive: true });
try {
  const { data: link, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: "info@getraenke-elias.de",
  });
  assert.ifError(error);
  let jar = [];
  auth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar,
        setAll: (v) => {
          jar = v;
        },
      },
    },
  );
  assert.ifError(
    (
      await auth.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "email",
      })
    ).error,
  );
  const ctx = await browser.newContext({
    viewport: { width: 1194, height: 834 },
  });
  await ctx.addCookies(
    jar.map((c) => ({
      name: c.name,
      value: c.value,
      domain: "127.0.0.1",
      path: "/",
      secure: false,
      sameSite: "Lax",
    })),
  );
  ctx.setDefaultTimeout(15000);
  const p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => {
    errors.push(e.message);
    console.log("PAGE ERROR", e.message);
  });
  const settings = {
    live_mode: false,
    discount_percent: 10,
    business_name: "Getränkeshop Elias · Frank Elias",
    business_address: "Wartbergstraße 3 · 74076 Heilbronn",
    tax_number: "",
    vat_id: "",
    register_id: "ELIAS-KASSE-01",
    default_tax_rate: 19,
    default_deposit_tax_rate: 19,
    auto_reorder: false,
    instagram: "",
    domain: "getraenke-elias.de",
    printer_mode: "browser",
    printer_address: "",
    tse_provider: "",
    smtp_host: "",
    smtp_port: 465,
    smtp_user: "",
    smtp_from: "",
  };
  const product = {
    id: "qa-0",
    sku: "QA-0",
    name: "Alwa Limonade Orange",
    category: "Limonade",
    pack_count: 6,
    volume_ml: 1000,
    price_cents: 890,
    deposit_cents: 240,
    tax_rate: 19,
    deposit_tax_rate: 19,
    stock: 100,
    min_stock: 0,
    target_stock: 0,
    supplier_id: null,
    reorder_enabled: false,
    active: true,
    verified: true,
    barcode: "",
    source: "QA",
    kind: "beverage",
  };
  const receipts = new Map(),
    bookRequests = [],
    epsonRequests = [];
  let loseBookingReply = false,
    losePrinterReply = false,
    pending = null;
  await ctx.route("**/api/admin", async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill({
        json: {
          operatorId: "qa-owner",
          pendingReceipt: pending,
          products: [product],
          suppliers: [],
          orders: [],
          sales: [],
          purchases: [],
          settings,
          closings: [],
          mail: [],
          role: "owner",
          permissions: [],
          name: "QA",
        },
      });
    const body = r.request().postDataJSON();
    if (body.action === "settings") {
      Object.assign(settings, body.value);
      return r.fulfill({ json: { ok: true } });
    }
    assert.equal(body.action, "sale");
    bookRequests.push(body.value);
    let receipt = receipts.get(body.value.id);
    if (!receipt) {
      const sale = {
        id: body.value.id,
        number: 900 + receipts.size,
        created_at: new Date().toISOString(),
        items: [{ ...product, quantity: 1 }],
        total_cents: 1130,
        net_cents: 950,
        tax_cents: 180,
        deposit_cents: 240,
        payment: body.value.payment,
        test_mode: true,
        actor_name: "QA",
        issuer_snapshot: { ...settings, website: settings.domain },
      };
      const pdf = await createReceiptPdf(sale);
      receipt = {
        sale,
        workflow: { stage: "pending", public_token: null },
        jobs: [],
        archived_at: new Date().toISOString(),
        pdf: Buffer.from(pdf.output("arraybuffer")),
      };
      receipts.set(sale.id, receipt);
      pending = sale.id;
      product.stock--;
    }
    if (loseBookingReply) {
      loseBookingReply = false;
      return r.abort("connectionreset");
    }
    return r.fulfill({ json: receipt.sale });
  });
  await ctx.route("**/api/operations", (r) =>
    r.fulfill({
      json: {
        customers: [],
        employees: [],
        deliveries: [],
        invoices: [],
        subscriptions: [],
      },
    }),
  );
  await ctx.route("**/api/receipts/**", async (r) => {
    const url = new URL(r.request().url()),
      id = url.pathname.split("/").at(-1),
      receipt = receipts.get(id);
    assert.ok(receipt);
    if (r.request().method() === "GET")
      return url.searchParams.get("format") === "pdf"
        ? r.fulfill({ body: receipt.pdf, contentType: "application/pdf" })
        : r.fulfill({ json: { ...receipt, pdf: undefined } });
    const { action, value } = r.request().postDataJSON();
    if (action === "print_start") {
      const job = {
        id: value.job_id,
        status: "sending",
        copy: receipt.jobs.length > 0,
        detail: "",
      };
      receipt.jobs.unshift(job);
      return r.fulfill({ json: { may_send: true, job } });
    }
    if (action === "print_finish") {
      Object.assign(
        receipt.jobs.find((j) => j.id === value.job_id),
        { status: value.status, detail: value.detail },
      );
      if (value.status === "confirmed") {
        receipt.workflow.stage = "done";
        pending = null;
      }
    }
    if (action === "digital") {
      assert.equal(value.consent, true);
      receipt.workflow = {
        stage: "digital",
        public_token: "a".repeat(64),
        share_expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
      };
    }
    if (action === "manual_paper") {
      assert.equal(value.confirmed, true);
      receipt.workflow.stage = "done";
      receipt.workflow.output_method = "manual_pdf";
      pending = null;
    }
    if (action === "digital_offered") {
      assert.ok(receipt.workflow.public_token);
      receipt.workflow.stage = "done";
      pending = null;
    }
    return r.fulfill({ json: receipt.workflow });
  });
  await ctx.route("https://printer.test/**", async (r) => {
    const body = r.request().postData() || "";
    epsonRequests.push(body);
    if (losePrinterReply && body.includes("<image")) {
      losePrinterReply = false;
      return r.abort("connectionreset");
    }
    return r.fulfill({
      contentType: "text/xml",
      body: '<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="2"/>',
    });
  });
  await p.goto(base + "/crm/einstellungen");
  await p.getByRole("button", { name: "Bon-Drucker", exact: true }).click();
  await p.getByLabel("Epson-Modell", { exact: true }).fill("TM-m30III");
  await p.getByRole("button", { name: "Weiter zum Netzwerk" }).click();
  await p
    .getByLabel("ePOS aktiv, HTTPS eingerichtet und Spooler ausgeschaltet", {
      exact: true,
    })
    .check();
  await p
    .getByRole("button", { name: "Verbindung prüfen", exact: true })
    .click();
  await p
    .getByLabel("HTTPS-Druckeradresse", { exact: true })
    .fill("https://printer.test");
  await p
    .getByRole("button", { name: "Status ohne Papierausgabe prüfen" })
    .click();
  await p
    .getByRole("button", { name: "Testbon automatisch drucken" })
    .waitFor();
  assert.equal(epsonRequests.length, 1);
  assert.doesNotMatch(epsonRequests[0], /<image|<cut|<feed/);
  await p.getByRole("button", { name: "Testbon automatisch drucken" }).click();
  await p
    .getByText("Epson hat den Auftrag bestätigt. Bitte Ausdruck prüfen.")
    .waitFor();
  assert.equal(epsonRequests.length, 2);
  assert.match(epsonRequests[1], /<image width="576"/);
  assert.match(epsonRequests[1], /<cut type="feed"/);
  const raster = Buffer.from(
    epsonRequests[1].match(/<image[^>]*>([^<]+)<\/image>/)[1],
    "base64",
  );
  assert.ok(raster.some((b) => b !== 0));
  assert.ok(raster.some((b) => b === 0));
  const blocks = [
    ...epsonRequests[1].matchAll(
      /<image width="(\d+)" height="(\d+)"[^>]*>([^<]+)<\/image>/g,
    ),
  ];
  await writeFile(
    "output/epson/test-print.pbm",
    Buffer.concat([
      Buffer.from(
        `P4\n${blocks[0][1]} ${blocks.reduce((n, b) => n + Number(b[2]), 0)}\n`,
      ),
      ...blocks.map((b) => Buffer.from(b[3], "base64")),
    ]),
  );

  await p
    .getByLabel(
      "Bon ist vollständig, Logo und Text sind lesbar, Papier wurde abgeschnitten",
      { exact: true },
    )
    .check();
  await p.screenshot({
    path: "output/epson/wizard-tablet.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Epson aktivieren & speichern" }).click();
  await p.getByText("Gespeichert.", { exact: true }).waitFor();
  assert.equal(settings.printer_mode, "epson");
  assert.match(
    await p.evaluate(() => localStorage.getItem("elias-epson-verified")),
    /printer.test/,
  );
  await p.goto(base + "/crm/kasse");
  await p.locator(".pos-products button").first().click();
  await p
    .getByRole("button", { name: "Bezahlen", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor();
  assert.equal(bookRequests.length, 1);
  assert.equal(product.stock, 99);
  losePrinterReply = true;
  await p.getByRole("button", { name: "Ja · Bon automatisch drucken" }).click();
  await p.getByText("Letzter Druckstatus:", { exact: false }).waitFor();
  await p.getByLabel("Drucker geprüft.", { exact: false }).waitFor();
  assert.equal([...receipts.values()][0].jobs[0].status, "unknown");
  assert.equal(bookRequests.length, 1);
  await p.reload();
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor();
  await p.getByLabel("Drucker geprüft.", { exact: false }).check();
  await p.getByRole("button", { name: "Ja · Bon automatisch drucken" }).click();
  await p
    .getByRole("heading", { name: "Bon ausgegeben", exact: true })
    .waitFor();
  assert.match(epsonRequests.at(-1), /KOPIE \/ ERNEUTER AUSDRUCK/);
  assert.equal(product.stock, 99);
  assert.equal(bookRequests.length, 1);
  await p.screenshot({
    path: "output/epson/receipt-printed-tablet.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Fertig · Nächster Kunde" }).click();
  await p.locator(".pos-products button").first().click();
  await p.getByRole("button", { name: "Karte", exact: true }).click();
  assert.equal(
    await p.getByRole("button", { name: "Bezahlen", exact: true }).isEnabled(),
    false,
  );
  await p
    .getByLabel(
      "Zahlung bzw. Erstattung am externen Kartenterminal erfolgreich bestätigt",
      { exact: true },
    )
    .check();
  loseBookingReply = true;
  await p.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await p
    .getByRole("button", { name: "Buchungsstatus erneut prüfen", exact: true })
    .waitFor();
  await p
    .getByRole("button", { name: "Buchungsstatus erneut prüfen", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor();
  assert.equal(bookRequests.length, 3);
  assert.equal(bookRequests[1].id, bookRequests[2].id);
  assert.equal(product.stock, 98);
  await p.getByRole("button", { name: "Nein · digital anbieten" }).click();
  assert.equal(
    await p.getByRole("button", { name: "Downloadcode anzeigen" }).isEnabled(),
    false,
  );
  await p
    .getByLabel("Kunde stimmt einem elektronischen Bon zu", { exact: true })
    .check();
  await p.getByRole("button", { name: "Downloadcode anzeigen" }).click();
  await p.getByAltText("QR-Code zum Download des Kassenbons").waitFor();
  assert.match(
    await p
      .getByRole("link", { name: "Digitalbon öffnen / herunterladen" })
      .getAttribute("href"),
    /\/api\/bon\/[a-f0-9]{64}$/,
  );
  await p.screenshot({
    path: "output/epson/digital-tablet.png",
    fullPage: true,
  });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p
    .getByRole("button", { name: "Digitalbon dem Kunden angeboten · Fertig" })
    .click();
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(pending, null);
  assert.equal(receipts.size, 2);
  assert.equal(product.stock, 98);
  await p.locator(".pos-products button").first().click();
  await p.getByRole("button", { name: "Bar", exact: true }).click();
  await p.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor();
  // Browser PDF viewer opens a second page; routing remains mocked on the context.
  await p.getByRole("button", { name: "Archivierten PDF-Bon öffnen" }).click();
  await p
    .getByLabel(
      "Papierbon wurde tatsächlich ausgedruckt und dem Kunden angeboten",
      { exact: true },
    )
    .check();
  await p
    .getByRole("button", { name: "Manuelle Papierausgabe dokumentieren" })
    .click();
  await p
    .getByRole("heading", { name: "Bon erwünscht?", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    [...receipts.values()].at(-1).workflow.output_method,
    "manual_pdf",
  );
  assert.equal(product.stock, 97);
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: Epson wizard, real PDF-to-raster, no-paper status probe, test print activation, double-click guard, unknown print/reload/copy, card confirmation, lost booking response/idempotent retry, consent+QR digital output, documented manual paper fallback, tablet layout and no page errors. Epson endpoint simulated; no physical printer tested.",
  );
} finally {
  if (auth) await auth.auth.signOut({ scope: "local" });
  await browser.close();
}
