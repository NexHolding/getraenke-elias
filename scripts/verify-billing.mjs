import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const f = JSON.parse(await readFile("output/billing/fixtures.json", "utf8"));
const products = JSON.parse(await readFile("data/catalog.json", "utf8"));
const data = {
  operatorId: "qa",
  products,
  suppliers: [],
  orders: [
    {
      ...f.order,
      delivery_date: new Date().toISOString().slice(0, 10),
      eta_start: "10:20",
      eta_end: "10:30",
      route_position: 1,
    },
  ],
  sales: [],
  purchases: [],
  closings: [],
  mail: [],
  role: "owner",
  permissions: [],
  name: "QA",
  pendingReceipt: null,
  settings: f.settings,
};
const op = {
  customers: [{ ...f.customer, payment_method: "cash" }],
  employees: [],
  deliveries: [],
  invoices: [f.invoice, f.overdue],
  subscriptions: [],
  can_manage_payments: true,
};
const commands = [];
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';import PdfPreview from './components/pdf-preview';createRoot(document.getElementById('root')).render(<><AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/><PdfPreview/></>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  plugins: [
    {
      name: "framework",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({
          path: a.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          resolveDir: process.cwd(),
          loader: "tsx",
          contents:
            a.path === "next/navigation"
              ? `const router={push:u=>location.assign(u),refresh:()=>{}};export function useRouter(){return router}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}`
              : a.path === "next/link"
                ? `import React from 'react';export default function Link(p){return <a {...p}/>} `
                : `import React from 'react';export default function Image({fill,priority,unoptimized,loader,...p}){return <img {...p}/>} `,
        }));
      },
    },
  ],
});
const css = (await readFile("app/globals.css", "utf8")).replace(
  /^@import.*$/gm,
  "",
);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3026");
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && url.pathname.startsWith("/api/")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const command = JSON.parse(body);
    commands.push(command);
    if (command.action === "invoice-paid") {
      assert.equal(command.confirmed, true);
      op.invoices = op.invoices.map((i) =>
        i.id === command.id
          ? {
              ...i,
              status: "paid",
              paid_at: new Date().toISOString(),
              payment_entry: { method: command.method },
            }
          : i,
      );
    }
    if (command.action === "settings") data.settings = command.value;
    if (command.action === "customer")
      op.customers[0] = { ...op.customers[0], ...command.value };
    if (command.action === "delivery") {
      assert.equal(command.value.payment_confirmed, true);
      assert.equal(command.value.payment_method, "card");
      const d = {
        ...command.value,
        status: "delivered",
        number: 9,
        created_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        customer_id: f.customer.id,
        items: f.order.items,
      };
      op.deliveries = [d];
      res.end(JSON.stringify(d));
      return;
    }
    res.end(
      JSON.stringify({
        ok: true,
        message:
          command.action === "customer-access"
            ? "Zugangsmail angefordert."
            : "Gespeichert.",
      }),
    );
    return;
  }
  if (url.pathname === "/api/admin") {
    res.end(JSON.stringify(data));
    return;
  }
  if (url.pathname === "/api/operations") {
    res.end(JSON.stringify(op));
    return;
  }
  if (url.pathname.startsWith("/api/documents/")) {
    res.setHeader("content-type", "application/pdf");
    res.end(
      await readFile(
        url.pathname.endsWith("ffffffffffff")
          ? "output/billing/payment-report.pdf"
          : "output/billing/invoice.pdf",
      ),
    );
    return;
  }
  if (url.pathname === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
    return;
  }
  if (
    /^\/(images|products|vendor)\//.test(url.pathname) &&
    !url.pathname.includes("..")
  ) {
    try {
      res.setHeader(
        "content-type",
        url.pathname.endsWith(".mjs")
          ? "text/javascript"
          : url.pathname.endsWith(".svg")
            ? "image/svg+xml"
            : "image/png",
      );
      res.end(await readFile("public" + url.pathname));
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    res.end(JSON.stringify({ messages: [], hasMore: false }));
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(
    `<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`,
  );
});
await new Promise((r) => server.listen(3026, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 1194, height: 834 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3026/crm/kunden");
  await page.getByRole("button", { name: /Testkunde.*K-/ }).click();
  await page
    .getByText("Online-Account aktiv", { exact: true })
    .first()
    .waitFor();
  await page.getByText("•••••••• · hinterlegt", { exact: true }).waitFor();
  assert.equal(await page.getByText("private-hash-never-return").count(), 0);
  await page
    .getByRole("button", { name: "Neuen Zugangslink senden", exact: true })
    .click();
  await page.getByText("Zugangsmail angefordert.", { exact: true }).waitFor();
  assert.equal(commands.at(-1).action, "customer-access");
  await page.screenshot({
    path: "output/billing/customer-access.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:3026/crm/einstellungen");
  await page.getByRole("button", { name: "Auslieferung", exact: true }).click();
  await page.getByLabel("Zahlungsziel für neue Rechnungen (Tage)").fill("21");
  await page
    .getByRole("button", { name: "Einstellungen speichern", exact: true })
    .click();
  await page.getByText("Einstellungen gespeichert.", { exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Auslieferung", exact: true }).click();
  assert.equal(
    await page
      .getByLabel("Zahlungsziel für neue Rechnungen (Tage)")
      .inputValue(),
    "21",
  );
  await page.goto("http://127.0.0.1:3026/crm/finanzen");
  await page
    .getByRole("heading", { name: "Lieferrechnungen", exact: true })
    .waitFor();
  await page.getByText("Mahnstufe 3", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/billing/invoice-ledger.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Zahlungseingang buchen", exact: true })
    .first()
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Zahlung verbindlich buchen" })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Vollständigen Zahlungseingang geprüft").check();
  await page
    .getByRole("button", { name: "Zahlung verbindlich buchen" })
    .click();
  await page.getByText("Bezahlt", { exact: true }).waitFor();
  assert.equal(commands.at(-1).action, "invoice-paid");
  await page.screenshot({
    path: "output/billing/invoice-paid.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rechnung anzeigen" }).first().click();
  await page.getByRole("img", { name: "Dokument · Seite 1" }).waitFor();
  await writeFile(
    "output/billing/invoice-render.png",
    Buffer.from(
      (
        await page
          .getByRole("img", { name: "Dokument · Seite 1" })
          .evaluate((c) => c.toDataURL())
      ).split(",")[1],
      "base64",
    ),
  );
  await page.getByRole("button", { name: "PDF-Dokument schließen" }).click();
  const reportBytes = await readFile("output/billing/payment-report.pdf");
  const pages = (reportBytes.toString("latin1").match(/\/Type \/Page\b/g) || [])
    .length;
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("elias:pdf-preview", {
        detail: "/api/documents/invoice/ffffffff-ffff-4fff-8fff-ffffffffffff",
      }),
    ),
  );
  await page.getByRole("img", { name: `Dokument · Seite ${pages}` }).waitFor();
  await writeFile(
    "output/billing/payment-report-render.png",
    Buffer.from(
      (
        await page
          .getByRole("img", { name: `Dokument · Seite ${pages}` })
          .evaluate((c) => c.toDataURL())
      ).split(",")[1],
      "base64",
    ),
  );
  await page.getByRole("button", { name: "PDF-Dokument schließen" }).click();
  await page.goto("http://127.0.0.1:3026/crm/lieferung");
  await page
    .getByText("Barzahlung · Vor Ort kassieren", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Lieferschein öffnen", exact: true })
    .click();
  await page
    .getByLabel("Name des Empfängers / Abstellvermerk")
    .fill("Testempfänger");
  assert.equal(
    await page
      .getByRole("button", { name: "Ware übergeben & Belege erstellen" })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Vollständigen Barbetrag erhalten").check();
  await page.getByLabel("Liefermenge Testwasser 12 × 0,7 l").fill("1");
  assert.equal(
    await page.getByLabel("Vollständigen Barbetrag erhalten").isChecked(),
    false,
  );
  await page
    .getByLabel("Zahlungsart vor Ort", { exact: true })
    .selectOption("card");
  await page.getByLabel("EC-Zahlung am separaten Gerät erfolgreich").check();
  await page.screenshot({
    path: "output/billing/driver-payment.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ware übergeben & Belege erstellen" })
    .click();
  await page
    .getByRole("heading", { name: "Lieferung bestätigt", exact: true })
    .waitFor();
  assert.equal(commands.at(-1).value.expected_payment_method, "cash");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3026/crm/finanzen");
  await page.getByText("Mahnstufe 3", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "output/billing/invoice-phone.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: customer login status and reset action; payment-term persistence; colored invoice states; explicit owner payment confirmation; driver cash/card hint and amount-change reset; in-app invoice PDF; phone overflow check. Isolated APIs; no messages sent.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
