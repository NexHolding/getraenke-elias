import { businessDocument } from "../lib/documents.ts";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { subscriptionCommandSchema } from "../lib/subscriptions.ts";
const f = JSON.parse(
  await readFile("output/delivery-flow/fixtures.json", "utf8"),
);
const products = f.products;
let account = {
  customer: f.customer,
  orders: [f.order],
  deliveries: f.deliveries,
  invoices: f.invoices,
  subscriptions: [],
};
const data = {
  operatorId: "qa",
  products,
  suppliers: [],
  orders: [
    {
      ...f.order,
      status: "confirmed",
      delivered: {},
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
let op = {
  customers: [f.customer],
  employees: [],
  deliveries: [],
  invoices: [],
  subscriptions: [],
};
const commands = [];
let deliveryPosts = 0;
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';import Account from './app/konto/page';import PdfPreview from './components/pdf-preview';createRoot(document.getElementById('root')).render(<>{location.pathname.startsWith('/konto')?<Account/>:<AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/>}<PdfPreview/></>);`,
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
      name: "framework-harness",
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
              ? `const router={push:(url)=>location.assign(url),refresh:()=>{}};export function useRouter(){return router}export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}`
              : a.path === "next/link"
                ? `import React from 'react';export default function Link(p){return <a {...p}/>}`
                : `import React from 'react';export default function Image({fill,priority,unoptimized,loader,...p}){return <img {...p} style={fill?{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"contain"}:undefined}/>} `,
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
  const u = new URL(req.url, "http://127.0.0.1:3023");
  res.setHeader("content-type", "application/json");
  if (
    ["/api/customer", "/api/operations"].includes(u.pathname) &&
    req.method === "POST"
  ) {
    let body = "";
    for await (const b of req) body += b;
    const command = JSON.parse(body);
    if (command.action === "delivery-subscription") {
      const v = subscriptionCommandSchema.parse(command.value);
      commands.push(v);
      const row = { ...v, revision: (v.revision ?? -1) + 1, last_error: null };
      account.subscriptions = [
        ...account.subscriptions.filter((s) => s.id !== v.id),
        row,
      ];
      op.subscriptions = account.subscriptions;
      res.end(JSON.stringify(row));
      return;
    }
    if (command.action === "delivery") {
      assert.equal(command.value.finalize, true);
      assert.ok(command.value.signature.startsWith("data:image/png;base64,"));
      assert.equal(command.value.signed_name, "Testempfänger");
      deliveryPosts++;
      const signed = businessDocument(
        "delivery",
        { ...f.deliveries[1], signature: command.value.signature },
        f.order,
        f.settings,
      );
      await writeFile(
        "output/delivery-flow/Elias-Unterschrift-Muster.pdf",
        signed.bytes,
      );
      op.deliveries = [f.deliveries[1]];
      op.invoices = [f.invoices[1]];
      data.orders[0].status = "completed";
      res.end(
        JSON.stringify({
          ...f.deliveries[1],
          invoice: f.invoices[1],
          archive_pending: false,
          mail_status: "queued",
        }),
      );
      return;
    }
    throw Error("Unexpected command " + command.action);
  }
  if (u.pathname === "/api/customer") {
    res.end(JSON.stringify(account));
    return;
  }
  if (u.pathname === "/api/catalog") {
    res.end(JSON.stringify({ products }));
    return;
  }
  if (u.pathname === "/api/admin") {
    res.end(JSON.stringify(data));
    return;
  }
  if (u.pathname === "/api/operations") {
    res.end(JSON.stringify(op));
    return;
  }
  if (u.pathname === "/api/communications") {
    res.end(
      JSON.stringify({
        messages: f.mail.map((m) => ({ ...m, attachments: [] })),
        hasMore: false,
      }),
    );
    return;
  }
  if (u.pathname.startsWith("/api/documents/")) {
    const invoice = u.pathname.includes("/invoice/");
    res.setHeader("content-type", "application/pdf");
    res.end(
      await readFile(
        !invoice && deliveryPosts
          ? "output/delivery-flow/Elias-Unterschrift-Muster.pdf"
          : "output/delivery-flow/Elias-" +
              (invoice ? "RE" : "LS") +
              "-000001.pdf",
      ),
    );
    return;
  }
  if (u.pathname === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
    return;
  }
  if (
    /^\/(images|products|vendor)\//.test(u.pathname) &&
    !u.pathname.includes("..")
  ) {
    try {
      res.setHeader(
        "content-type",
        u.pathname.endsWith(".mjs")
          ? "text/javascript"
          : u.pathname.endsWith(".svg")
            ? "image/svg+xml"
            : u.pathname.endsWith(".png")
              ? "image/png"
              : "application/octet-stream",
      );
      res.end(await readFile("public" + u.pathname));
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(
    `<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script>window.eliasNative={app:'customer',version:1};window.webkit={messageHandlers:{elias:{postMessage:async()=>null}}}</script><script src="/app.js"></script></body></html>`,
  );
});
await new Promise((r) => server.listen(3023, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3023/konto");
  await page.getByRole("heading", { name: "Dein Bestellverlauf" }).waitFor();
  assert.equal(await page.locator(".site-header").isVisible(), false);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "output/delivery-flow/customer-orders-iphone.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page
    .getByRole("button", { name: "Lieferabo anlegen", exact: true })
    .click();
  await page
    .getByLabel("Artikel suchen", { exact: true })
    .fill("Alwa Limonade Orange");
  await page.getByRole("button", { name: /Alwa Limonade Orange/ }).click();
  await page
    .getByRole("button", { name: "Lieferabo speichern", exact: true })
    .isDisabled()
    .then((v) => assert.equal(v, true));
  await page
    .getByLabel("Menge Alwa Limonade Orange", { exact: true })
    .fill("4");
  await page
    .getByLabel("Lieferintervall", { exact: true })
    .selectOption("biweekly");
  await page.screenshot({
    path: "output/delivery-flow/customer-subscription-iphone.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Lieferabo speichern", exact: true })
    .click();
  await page.getByText(/Lieferabo gespeichert\./).waitFor();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].items[0].quantity, 4);
  await page.getByRole("button", { name: "Pausieren", exact: true }).click();
  await page.getByText(/Lieferabo pausiert\./).waitFor();
  assert.equal(commands[1].active, false);
  for (const [tab, prefix] of [
    ["Rechnungen", "invoice"],
    ["Lieferscheine", "delivery"],
  ]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.screenshot({
      path: `output/delivery-flow/customer-${prefix}-iphone.png`,
      fullPage: true,
    });
    const before = context.pages().length;
    await page
      .getByRole("button", { name: "PDF anzeigen", exact: true })
      .first()
      .click();
    await page
      .getByRole("img", { name: "Dokument · Seite 1" })
      .waitFor({ timeout: 20000 });
    assert.equal(context.pages().length, before);
    await writeFile(
      `output/delivery-flow/${prefix}-render.png`,
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
  }
  await page
    .getByRole("button", { name: "Kommunikation", exact: true })
    .click();
  await page
    .getByText(/Elias – Rechnung/)
    .first()
    .waitFor();
  await page.screenshot({
    path: "output/delivery-flow/customer-communication-iphone.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1194, height: 834 });
  await page.goto("http://127.0.0.1:3023/crm/kunden");
  await page.getByRole("button", { name: /Elias Testkunde.*K-/ }).click();
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page.getByRole("button", { name: "Lieferabo anlegen" }).click();
  await page
    .getByLabel("Artikel suchen", { exact: true })
    .fill("Alwa Limonade Orange");
  await page.getByRole("button", { name: /Alwa Limonade Orange/ }).click();
  await page
    .getByRole("button", { name: "Lieferabo speichern", exact: true })
    .click();
  await page.getByText(/Lieferabo gespeichert\./).waitFor();
  assert.equal(commands.length, 3);
  await page.screenshot({
    path: "output/delivery-flow/staff-subscriptions-ipad.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:3023/crm/lieferung");
  await page
    .getByRole("button", { name: "Lieferschein öffnen", exact: true })
    .click();
  await page
    .getByLabel("Name des Empfängers / Abstellvermerk")
    .fill("Testempfänger");
  const canvas = page.getByLabel("Unterschrift hier zeichnen");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 80, { steps: 10 });
  await page.mouse.move(box.x + 190, box.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.screenshot({
    path: "output/delivery-flow/driver-signature-ipad.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Ware übergeben & Belege erstellen" })
    .click();
  await page.getByRole("heading", { name: "Lieferung bestätigt" }).waitFor();
  assert.equal(deliveryPosts, 1);
  await page.screenshot({
    path: "output/delivery-flow/driver-confirmed-ipad.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "PDF anzeigen", exact: true })
    .first()
    .click();
  await page.getByRole("img", { name: "Dokument · Seite 1" }).waitFor();
  await writeFile(
    "output/delivery-flow/signed-delivery-render.png",
    Buffer.from(
      (
        await page
          .getByRole("img", { name: "Dokument · Seite 1" })
          .evaluate((c) => c.toDataURL())
      ).split(",")[1],
      "base64",
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: responsive iPhone customer portal, 4-crate subscription create/pause, staff subscription in customer record, documents render inside app, communication history, iPad driver signature and one delivery finalization. Real components/PDF.js with isolated API fixtures; no outgoing mail.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
