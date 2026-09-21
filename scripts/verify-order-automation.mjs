import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const f = JSON.parse(
  await readFile("output/delivery-corrections/fixtures.json", "utf8"),
);
const products = JSON.parse(await readFile("data/catalog.json", "utf8"));
const today = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
}).format(new Date());
const data = {
  operatorId: "qa",
  products,
  suppliers: [],
  orders: [],
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
const events = [];
const seen = new Set();
let revision = 0;
const commands = [];
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';createRoot(document.getElementById('root')).render(<AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/>);`,
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
                ? `import React from 'react';export default function Link(p){return <a {...p}/>}`
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
  const url = new URL(req.url, "http://127.0.0.1:3031");
  res.setHeader("content-type", "application/json");
  let v = {};
  if (req.method === "POST") {
    let body = "";
    for await (const c of req) body += c;
    v = JSON.parse(body);
    commands.push(v);
  }
  if (url.pathname === "/api/order-inbox") {
    if (v.action === "seen") seen.add(v.id);
    return res.end(
      JSON.stringify({
        orders: events
          .filter((id) => !seen.has(id))
          .map((id) => data.orders.find((o) => o.id === id)),
        revision,
      }),
    );
  }
  if (url.pathname === "/api/admin") return res.end(JSON.stringify(data));
  if (url.pathname === "/api/operations") {
    if (v.action === "start-tour") {
      let started = 0,
        payment_pending = 0;
      for (const o of data.orders) {
        if (
          o.delivery_date === v.date &&
          ["confirmed", "partial"].includes(o.status)
        ) {
          if (!o.approved_payment_method) {
            payment_pending++;
            continue;
          }
          o.status = "delivering";
          started++;
        }
      }
      revision++;
      return res.end(JSON.stringify({ started, payment_pending }));
    }
    return res.end(JSON.stringify(op));
  }
  if (url.pathname === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    return res.end(bundle.outputFiles[0].text);
  }
  if (
    /^\/(images|products)\//.test(url.pathname) &&
    !url.pathname.includes("..")
  ) {
    try {
      res.setHeader("content-type", "image/png");
      return res.end(await readFile("public" + url.pathname));
    } catch {
      res.statusCode = 404;
      return res.end();
    }
  }
  if (url.pathname.startsWith("/api/")) return res.end("{}");
  res.setHeader("content-type", "text/html");
  res.end(
    `<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><div id="root"></div><script src="/app.js"></script></html>`,
  );
});
await new Promise((r) => server.listen(3031, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/order-automation", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1194, height: 834 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3031/crm/uebersicht");
  await page
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .waitFor();
  const add = (status = "confirmed", state = "available", method = "cash") => {
    const o = {
      ...f.order,
      id: crypto.randomUUID(),
      number: 100 + data.orders.length,
      customer_name: "Bestelltest " + (data.orders.length + 1),
      created_at: new Date().toISOString(),
      delivery_date: today,
      status,
      items: [{ ...f.items[0], quantity: 4 }],
      delivered: {},
      auto_confirmed_at:
        status === "confirmed" ? new Date().toISOString() : null,
      approved_payment_method: method,
      stock_check: [
        {
          id: f.items[0].id,
          name: f.items[0].name,
          required: 4,
          stock: 5,
          reserved: state === "shortage" ? 4 : 0,
          available: state === "unknown" ? null : state === "shortage" ? 1 : 5,
          missing: state === "unknown" ? null : state === "shortage" ? 3 : 0,
          state,
        },
      ],
    };
    data.orders.push(o);
    events.push(o.id);
    revision++;
    return o;
  };
  const poll = () =>
    page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const first = add();
  await poll();
  let dialog = page.getByRole("dialog", {
    name: "Neue Bestellung",
    exact: true,
  });
  await dialog.waitFor();
  await dialog.getByText("Bestätigt", { exact: true }).waitFor();
  await dialog.getByText("Vorrätig", { exact: true }).waitFor();
  await dialog.screenshot({ path: "output/order-automation/confirmed.png" });
  await dialog.getByRole("button", { name: "Gesehen", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.ok(seen.has(first.id));
  await page.reload();
  await page
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .waitFor();
  assert.equal(await dialog.count(), 0);
  await page.evaluate(() => {
    const blocker = document.createElement("section");
    blocker.id = "payment-test";
    blocker.setAttribute("role", "dialog");
    blocker.textContent = "Zahlung läuft";
    document.body.appendChild(blocker);
  });
  const short = add("new", "shortage");
  await poll();
  await page.getByRole("button", { name: "Bestelleingang öffnen" }).waitFor();
  assert.equal(await dialog.count(), 0);
  await page.evaluate(() => document.getElementById("payment-test").remove());
  await dialog.waitFor();
  await dialog.getByText("3 fehlen", { exact: true }).waitFor();
  await dialog.screenshot({ path: "output/order-automation/shortage.png" });
  await dialog.getByRole("button", { name: "Gesehen", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  const unknown = add("new", "unknown");
  await poll();
  await dialog.waitFor();
  await dialog.getByText("Bestand unbekannt", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Gesehen", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  short.status = "confirmed";
  short.auto_confirmed_at = new Date().toISOString();
  short.stock_check[0] = {
    ...short.stock_check[0],
    stock: 8,
    available: 4,
    missing: 0,
    state: "available",
  };
  revision++;
  await poll();
  assert.equal(await dialog.count(), 0);
  const invoice = add("confirmed", "available", null);
  await poll();
  await dialog.waitFor();
  await dialog.getByText(/Zahlungsart ist noch freizugeben/).waitFor();
  await dialog.getByRole("button", { name: "Gesehen", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.goto("http://127.0.0.1:3031/crm/lieferung");
  await page.getByRole("button", { name: "Tour starten", exact: true }).click();
  await page
    .getByText(
      "2 Bestellungen sind jetzt in Lieferung. 1 Auftrag wartet auf Zahlungsfreigabe.",
      { exact: true },
    )
    .waitFor();
  assert.equal(first.status, "delivering");
  assert.equal(short.status, "delivering");
  assert.equal(invoice.status, "confirmed");
  assert.equal(unknown.status, "new");
  assert.equal(
    await page
      .getByRole("button", { name: "Tour starten", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: "output/order-automation/tour.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: automatic inbox popup on arrival; available and missing stock; unknown stock; persistent seen state on reload; popup waits during payment dialog; replenished seen order does not repop; invoice approval warning; one tour start changes eligible orders only. Tablet screenshots, no live mail or orders.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
