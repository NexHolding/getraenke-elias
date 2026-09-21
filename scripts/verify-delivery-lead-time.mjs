import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { earliestNewDelivery, berlinDate } from "../lib/delivery-date.ts";
import { buildTourPreview } from "../lib/subscription-preview.ts";
import { deliveryListPdf } from "../lib/delivery-list.ts";
import { planDay } from "../lib/delivery-plan.ts";
const tomorrow = earliestNewDelivery(),
  today = berlinDate();
const customer = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Testkunde",
  email: "test@example.test",
  phone: "071310000",
  address: "Teststraße 1, 74076 Heilbronn",
  street: "Teststraße",
  house_number: "1",
  postal_code: "74076",
  city: "Heilbronn",
};
const products = JSON.parse(await readFile("data/catalog.json", "utf8"));
const commands = [];
const sub = {
  id: "preview",
  customer_id: customer.id,
  active: true,
  next_date: tomorrow,
  interval: "weekly",
  items: [{ id: products[0].id, quantity: 4 }],
};
const orders = [
  {
    id: "a",
    number: 1,
    customer_name: "Neue Bestellung",
    status: "confirmed",
    created_at: new Date().toISOString(),
    requested_delivery_date: tomorrow,
    items: [],
    delivered: {},
  },
];
const cfg = {
  delivery_days: [1, 2, 3, 4, 5, 6, 7],
  delivery_from: "10:00",
  delivery_to: "18:00",
  delivery_stop_minutes: 10,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import PdfPreview from './components/pdf-preview';import {DeliveryManager} from './components/operations';import StaffOrders from './components/staff-orders';import SubscriptionManager from './components/subscription-manager';const data=${JSON.stringify({ customer, products, orders })};function App(){const[orders,setOrders]=React.useState(data.orders);const reload=async()=>setOrders(await(await fetch('/orders')).json());return location.pathname==='/staff'?<StaffOrders products={data.products} reload={reload}/>:location.pathname==='/subscription'?<SubscriptionManager customer={data.customer} subscriptions={[]} products={data.products} onChanged={reload}/>:<DeliveryManager orders={orders} reload={reload}/>};createRoot(document.getElementById('root')).render(<><App/><PdfPreview/></>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  plugins: [
    {
      name: "framework",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({
          path: a.path,
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents:
            a.path === "next/navigation"
              ? `export function useRouter(){return {push:()=>{},refresh:()=>{}}}export function usePathname(){return '/'}export function useSearchParams(){return new URLSearchParams()}`
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
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/vendor/") && !req.url.includes("..")) {
    res.setHeader(
      "Content-Type",
      req.url.endsWith(".mjs") ? "text/javascript" : "application/octet-stream",
    );
    return res.end(await readFile("public" + req.url));
  }
  if (req.url === "/api/customer" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const command = JSON.parse(body);
    commands.push(command);
    customer.windows = command.value.delivery_windows;
    return res.end(JSON.stringify({ id: command.value.id }));
  }
  if (req.url.startsWith("/api/delivery-preview")) {
    const date = new URL(req.url, "http://localhost").searchParams.get("date");
    return res.end(
      JSON.stringify(
        buildTourPreview(orders, [sub], [customer], products, date, cfg),
      ),
    );
  }
  if (req.url.startsWith("/api/delivery-list")) {
    const date = new URL(req.url, "http://localhost").searchParams.get("date");
    const preview = buildTourPreview(
      orders,
      [sub],
      [customer],
      products,
      date,
      cfg,
    );
    res.setHeader("Content-Type", "application/pdf");
    const pdf = deliveryListPdf(
      preview.orders,
      date,
      cfg,
      [],
      true,
      preview.unplanned.map((o) => o.name + ": " + o.reason),
    );
    await mkdir("output/delivery-lead-time", { recursive: true });
    await writeFile("output/delivery-lead-time/tour-preview.pdf", pdf);
    return res.end(pdf);
  }
  if (req.url === "/api/operations" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const command = JSON.parse(body);
    assert.equal(command.action, "plan");
    const plan = planDay(orders, command.date, cfg);
    for (const stop of plan.stops)
      Object.assign(
        orders.find((o) => o.id === stop.id),
        { delivery_date: command.date, ...stop, route_position: stop.position },
      );
    return res.end(JSON.stringify(plan));
  }
  if (req.url === "/api/operations")
    return res.end(
      JSON.stringify({
        customers: [customer],
        employees: [],
        deliveries: [],
        invoices: [],
        subscriptions: [],
      }),
    );
  if (req.url === "/orders") return res.end(JSON.stringify(orders));
  if (req.url === "/app.js") {
    res.setHeader("Content-Type", "text/javascript");
    return res.end(bundle.outputFiles[0].text);
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`,
  );
});
await new Promise((r) => server.listen(3034, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1194, height: 834 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3034/staff");
  await page
    .getByRole("button", { name: "Bestellung anlegen", exact: true })
    .click();
  const first = page.getByLabel("Erster Liefertermin", { exact: true });
  assert.equal(await first.inputValue(), tomorrow);
  assert.equal(await first.getAttribute("min"), tomorrow);
  await first.fill(today);
  assert.equal(await first.evaluate((el) => el.validity.rangeUnderflow), true);
  await page.goto("http://127.0.0.1:3034/subscription");
  await page.getByRole("button", { name: /Lieferabo anlegen/ }).click();
  const start = page.getByLabel("Starttermin", { exact: true });
  assert.equal(await start.inputValue(), tomorrow);
  assert.equal(await start.getAttribute("min"), tomorrow);
  await page.getByLabel("Lieferzeiten für das Abo").waitFor();
  await page
    .getByRole("button", { name: "Lieferzeit hinzufügen", exact: true })
    .click();
  await page.getByLabel("Lieferzeit von 1", { exact: true }).fill("12:00");
  await page.getByLabel("Lieferzeit bis 1", { exact: true }).fill("15:00");
  await page.locator(".subscription-results button").first().click();
  await page
    .locator(".subscription-editor input[type=number]")
    .first()
    .fill("4");
  await page
    .getByRole("button", { name: "Lieferabo speichern", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Lieferabo gespeichert" })
    .waitFor();
  assert.equal(commands.length, 1);
  assert.equal(commands[0].value.next_date, tomorrow);
  assert.equal(customer.windows[0].from, "12:00");
  await page.goto("http://127.0.0.1:3034/plan");
  assert.equal(
    await page.getByLabel("Liefertag auswählen", { exact: true }).inputValue(),
    tomorrow,
  );
  await page
    .getByLabel("Tourvorschau", { exact: true })
    .getByText("Abo-Vorschau · noch kein Auftrag")
    .waitFor();
  await page.getByRole("button", { name: "Heute", exact: true }).click();
  await page.getByRole("button", { name: "Tagestour planen" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "0 Stopps geplant" })
    .waitFor();
  await page.getByLabel("Liefertag auswählen", { exact: true }).fill(tomorrow);
  await page.getByRole("button", { name: "Tagestour planen" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "1 Stopps geplant" })
    .waitFor();
  await page.getByText(/10:20/).first().waitFor();
  await mkdir("output/delivery-lead-time", { recursive: true });
  await page.screenshot({
    path: "output/delivery-lead-time/ipad-abo.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Vorschau als PDF", exact: true })
    .click();
  await page.locator(".pdf-preview canvas").first().waitFor();
  await page
    .locator(".pdf-preview canvas")
    .first()
    .screenshot({ path: "output/delivery-lead-time/tour-preview-pdf.png" });
  await page
    .getByRole("button", { name: "PDF-Dokument schließen", exact: true })
    .click();
  await page
    .getByLabel("Liefertag auswählen", { exact: true })
    .fill("2020-01-01");
  assert.equal(
    await page.getByRole("button", { name: "Tagestour planen" }).isDisabled(),
    true,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3034/subscription");
  await page.getByRole("button", { name: /Lieferabo anlegen/ }).click();
  assert.equal(
    await page.getByLabel("Starttermin", { exact: true }).getAttribute("min"),
    tomorrow,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Lieferzeit hinzufügen", exact: true })
    .click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "time fields fit phone viewport",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS real React forms: missing delivery windows collected and submitted with subscription; tomorrow default/minimum for staff and customer; subscription preview and inline PDF; same-day date invalid; real planner today 0 and tomorrow 1 stop; past-day plan disabled; iPad and phone rendering without JS errors. No production writes.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
