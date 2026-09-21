import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const f = JSON.parse(
  await readFile("output/delivery-corrections/fixtures.json", "utf8"),
);
const products = JSON.parse(await readFile("data/catalog.json", "utf8"));
const data = {
  operatorId: "qa",
  products,
  suppliers: [],
  orders: [
    {
      ...f.order,
      status: "new",
      requested_payment_method: "invoice",
      approved_payment_method: null,
      payment_revision: 0,
      delivered: {},
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
  customers: [f.customer],
  employees: [],
  deliveries: [],
  invoices: [],
  subscriptions: [],
};
const commands = [];
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';import PdfPreview from './components/pdf-preview';import SiteShell from './components/site-shell';import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/legacy/build/pdf.mjs';window.inspectPdf=async url=>{GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';const pdf=await getDocument({data:new Uint8Array(await(await fetch(url)).arrayBuffer()),standardFontDataUrl:'/vendor/pdf-fonts/'}).promise;const pages=[];for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n);pages.push((await p.getTextContent()).items.map(i=>i.str).join(' '))}return pages};createRoot(document.getElementById('root')).render(<>{location.pathname==='/shop'?<SiteShell><p>Testshop</p></SiteShell>:<AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/>}<PdfPreview/></>);`,
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
  const url = new URL(req.url, "http://127.0.0.1:3029");
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && url.pathname.startsWith("/api/")) {
    let body = "";
    for await (const c of req) body += c;
    const v = JSON.parse(body);
    commands.push(v);
    if (v.action === "order-status") {
      data.orders[0] = {
        ...data.orders[0],
        status: v.status,
        approved_payment_method: v.payment_method,
        payment_revision: data.orders[0].payment_revision + 1,
      };
    }
    if (v.action === "delivery") {
      const d = {
        ...v.value,
        number: 99,
        created_at: new Date().toISOString(),
        status: v.value.finalize ? "delivered" : "draft",
        revision: 1,
        items: v.value.items
          .filter((i) => i.quantity > 0)
          .map((i) => ({
            ...data.orders[0].items.find((item) => item.id === i.id),
            quantity: i.quantity,
          })),
      };
      d.deposit_returns = (v.value.returns || []).map((r) => ({
        id: `return-${r.deposit_cents}`,
        name: "Pfandrücknahme",
        quantity: -r.quantity,
        deposit_cents: r.deposit_cents,
        price_cents: 0,
        tax_rate: 19,
        deposit_tax_rate: 19,
      }));
      d.total_cents = [...d.items, ...d.deposit_returns].reduce(
        (sum, l) => sum + l.quantity * (l.price_cents + (l.deposit_cents || 0)),
        0,
      );
      d.payment_method = v.value.payment_method;
      op.deliveries = [d];
      if (v.value.finalize) data.orders[0].status = "completed";
      return res.end(JSON.stringify(d));
    }
    return res.end(JSON.stringify({ ok: true, number: "EL-TEST" }));
  }
  if (url.pathname === "/api/admin") return res.end(JSON.stringify(data));
  if (url.pathname === "/api/operations") return res.end(JSON.stringify(op));
  if (url.pathname === "/api/customer")
    return res.end(
      JSON.stringify({
        customer: {
          ...f.customer,
          phone: "071310000",
          street: "Teststraße",
          house_number: "1",
          postal_code: "74076",
          city: "Heilbronn",
        },
      }),
    );
  if (url.pathname === "/api/catalog")
    return res.end(JSON.stringify({ products, guest_orders: true }));
  if (url.pathname.endsWith("/00000000-0000-0000-0000-000000000030")) {
    res.setHeader("content-type", "application/pdf");
    return res.end(
      await readFile(
        `output/delivery-returns/${url.pathname.includes("/invoice/") ? "invoice" : "delivery"}.pdf`,
      ),
    );
  }
  if (url.pathname.startsWith("/api/documents/delivery/")) {
    res.setHeader("content-type", "application/pdf");
    return res.end(await readFile("output/delivery-corrections/partial.pdf"));
  }
  if (url.pathname === "/api/delivery-list") {
    res.setHeader("content-type", "application/pdf");
    return res.end(
      await readFile(
        `output/delivery-corrections/${url.searchParams.get("date") === "2030-01-01" ? "list-multipage" : "list"}.pdf`,
      ),
    );
  }
  if (url.pathname === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(bundle.outputFiles[0].text);
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
            : url.pathname.endsWith(".pfb")
              ? "application/octet-stream"
              : "image/png",
      );
      return res.end(await readFile("public" + url.pathname));
    } catch {
      res.statusCode = 404;
      return res.end();
    }
  }
  if (url.pathname.startsWith("/api/"))
    return res.end(JSON.stringify({ messages: [], hasMore: false }));
  res.setHeader("content-type", "text/html");
  res.end(
    `<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>`,
  );
});
await new Promise((r) => server.listen(3029, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1194, height: 834 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3029/crm/bestellungen");
  await page
    .getByLabel(`Zahlungsart Auftrag ${f.order.number}`)
    .selectOption("cash");
  await page
    .getByRole("button", { name: "Zahlungsart bestätigen & Auftrag freigeben" })
    .click();
  await page
    .getByText("Auftrag und Zahlungsart aktualisiert.", { exact: true })
    .waitFor();
  assert.equal(commands.at(-1).payment_method, "cash");
  assert.equal(data.orders[0].requested_payment_method, "invoice");
  await page.screenshot({
    path: "output/delivery-corrections/approval.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:3029/crm/lieferung");
  await page
    .getByRole("button", { name: "Lieferschein öffnen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Nicht dabei", exact: true })
    .nth(1)
    .click();
  assert.equal(
    await page.getByLabel(`Liefermenge ${f.items[1].name}`).inputValue(),
    "",
  );
  await page.getByLabel(`Liefermenge ${f.items[0].name}`).fill("2");
  await page
    .getByRole("button", { name: "Entwurf speichern", exact: true })
    .click();
  await page
    .getByText("Entwurf gespeichert. Noch keine Rechnung oder Lagerbuchung.", {
      exact: false,
    })
    .last()
    .waitFor();
  const command = commands.at(-1);
  assert.equal(command.value.items[1].quantity, 0);
  assert.equal(command.value.items[0].quantity, 2);
  assert.equal(command.value.finalize, false);
  await page.getByLabel("Vollständigen Barbetrag erhalten").check();
  await page.getByLabel(`Liefermenge ${f.items[0].name}`).fill("1");
  assert.equal(
    await page.getByLabel("Vollständigen Barbetrag erhalten").isChecked(),
    false,
  );
  await page.screenshot({
    path: "output/delivery-corrections/quantities.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Lieferliste drucken", exact: true })
    .click();
  await page.locator(".pdf-preview-pages canvas").waitFor();
  await page.screenshot({
    path: "output/delivery-corrections/list-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Drucken", exact: true }).click();
  await page.getByRole("button", { name: "PDF-Dokument schließen" }).click();
  const partialUrl = `/api/documents/delivery/${f.delivery.id}`;
  for (const [name, url] of [
    ["partial", partialUrl],
    ["multipage", "/api/delivery-list?date=2030-01-01"],
  ]) {
    const pages = await page.evaluate((url) => window.inspectPdf(url), url);
    assert.ok(pages.length >= (name === "multipage" ? 2 : 1));
    assert.ok(pages.join(" ").includes("Alwa Zitrone"));
    if (name === "partial")
      assert.match(pages.join(" "), /Bestellt.*Diese Lieferung.*Noch offen/);
    await page.evaluate(
      (url) =>
        window.dispatchEvent(
          new CustomEvent("elias:pdf-preview", { detail: url }),
        ),
      url,
    );
    await page
      .locator(".pdf-preview-pages canvas")
      .nth(pages.length - 1)
      .waitFor();
    for (let n = 0; n < pages.length; n++) {
      const image = await page
        .locator(".pdf-preview-pages canvas")
        .nth(n)
        .evaluate((c) => c.toDataURL("image/png"));
      await writeFile(
        `output/delivery-corrections/${name}-${n + 1}.png`,
        Buffer.from(image.split(",")[1], "base64"),
      );
    }
    await page.getByRole("button", { name: "PDF-Dokument schließen" }).click();
  }
  data.orders[0].approved_payment_method = "invoice";
  data.orders[0].payment_revision++;
  op.deliveries[0].payment_method = "invoice";
  await page.goto("http://127.0.0.1:3029/crm/lieferung");
  await page
    .getByRole("button", { name: "Lieferschein öffnen", exact: true })
    .click();
  const paymentSelect = page.getByLabel("Zahlungsart vor Ort");
  assert.equal(await paymentSelect.inputValue(), "invoice");
  await paymentSelect.selectOption("card");
  const finish = page.getByRole("button", {
    name: "Ware übergeben & Belege erstellen",
  });
  await page
    .getByLabel("Name des Empfängers", { exact: true })
    .fill("QA Empfänger");
  await page.getByLabel("EC-Zahlung am separaten Gerät erfolgreich").check();
  assert.equal(await finish.isDisabled(), true);
  const sign = async () => {
    const canvas = page.getByLabel("Unterschrift hier zeichnen");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 180, box.y + 110, { steps: 10 });
    await page.mouse.up();
  };
  await sign();
  assert.equal(await finish.isEnabled(), true);
  await page
    .getByRole("button", { name: "Pfand erfassen", exact: true })
    .click();
  const deposit = page.getByRole("dialog", {
    name: "Pfand erfassen",
    exact: true,
  });
  await deposit.getByLabel("Rückgabe Einweg / Dose").fill("3");
  await deposit.getByRole("button", { name: /12er Wasser/ }).click();
  await deposit.screenshot({
    path: "output/delivery-returns/deposit-dialog.png",
  });
  await deposit
    .getByRole("button", { name: "Pfand speichern", exact: true })
    .click();
  await deposit.waitFor({ state: "hidden" });
  assert.equal(
    await page
      .getByLabel("EC-Zahlung am separaten Gerät erfolgreich")
      .isChecked(),
    false,
  );
  assert.equal(await finish.isDisabled(), true);
  await page
    .getByText("Zahlbetrag nach Pfandrücknahme: 20,73 €", { exact: true })
    .waitFor();
  assert.equal(
    commands
      .at(-1)
      .value.returns.reduce((sum, r) => sum + r.quantity * r.deposit_cents, 0),
    405,
  );
  assert.equal(commands.at(-1).value.signature, null);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page
    .getByRole("button", { name: "Lieferschein öffnen", exact: true })
    .click();
  await page
    .getByText("Zahlbetrag nach Pfandrücknahme: 20,73 €", { exact: true })
    .waitFor();
  await paymentSelect.selectOption("cash");
  await page
    .getByLabel("Name des Empfängers", { exact: true })
    .fill("QA Empfänger");
  await page.getByLabel("Vollständigen Barbetrag erhalten").check();
  assert.equal(await finish.isDisabled(), true);
  await sign();
  assert.equal(await finish.isEnabled(), true);
  await page
    .getByRole("dialog", { name: "Lieferschein", exact: true })
    .screenshot({ path: "output/delivery-returns/settlement.png" });
  await finish.click();
  await page.getByRole("heading", { name: "Lieferung bestätigt" }).waitFor();
  await page
    .locator(".delivery-success")
    .getByText("20,73 €", { exact: true })
    .waitFor();
  assert.equal(commands.at(-1).value.payment_method, "cash");
  assert.ok(commands.at(-1).value.signature.startsWith("data:image/png"));
  for (const kind of ["delivery", "invoice"]) {
    const url = `/api/documents/${kind}/00000000-0000-0000-0000-000000000030`;
    const pages = await page.evaluate((url) => window.inspectPdf(url), url);
    assert.ok(pages.join(" ").includes("Pfandrücknahme"));
    assert.ok(pages.join(" ").includes("20,73"));
    await page.evaluate(
      (url) =>
        window.dispatchEvent(
          new CustomEvent("elias:pdf-preview", { detail: url }),
        ),
      url,
    );
    await page
      .locator(".pdf-preview-pages canvas")
      .nth(pages.length - 1)
      .waitFor();
    for (let n = 0; n < pages.length; n++) {
      const image = await page
        .locator(".pdf-preview-pages canvas")
        .nth(n)
        .evaluate((c) => c.toDataURL("image/png"));
      await writeFile(
        `output/delivery-returns/${kind}-${n + 1}.png`,
        Buffer.from(image.split(",")[1], "base64"),
      );
    }
    await page.getByRole("button", { name: "PDF-Dokument schließen" }).click();
  }
  await page.goto("http://127.0.0.1:3029/shop");
  const product = products.find((p) => p.id === f.items[0].id);
  await page.evaluate((product) => {
    sessionStorage.setItem(
      "elias-cart",
      JSON.stringify([{ product, quantity: 4 }]),
    );
    window.dispatchEvent(new Event("elias-cart-change"));
  }, product);
  await page
    .getByRole("button", { name: /Getränke bestellen/ })
    .first()
    .click();
  const payment = page.getByLabel("Gewünschte Zahlungsart");
  await payment.waitFor();
  assert.equal(await payment.inputValue(), "");
  await payment.selectOption("card");
  assert.equal(await payment.evaluate((e) => e.required), true);
  await payment.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "output/delivery-corrections/checkout.png",
    fullPage: true,
  });
  const checkboxes = page.locator(".cart-drawer input[type=checkbox]");
  for (const checkbox of await checkboxes.all()) await checkbox.check();
  await page
    .getByRole("button", { name: "Lieferanfrage senden", exact: true })
    .click();
  await page.getByText(/Deine Anfrage EL-TEST/).waitFor();
  assert.equal(commands.at(-1).requested_payment_method, "card");
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: customer chooses payment explicitly, seller overrides invoice request to cash; delivery editor excludes missing article and resets payment acknowledgement after amount change; dedicated PDF preview and print; tablet screenshots; invoice customer pays cash/card; deposit dialog saves and restores draft, correct overview amount, signature mandatory and reset after changes, delivery and invoice PDFs include deposit deduction.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
