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
let data = {
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
import { buildCashBookReport } from "../lib/cash-book.ts";
const days = [],
  entries = [],
  commands = [],
  downloads = [];
let readOnly = false;
const add = (day, kind, amount, description, extra = {}) => {
  const e = {
    id: crypto.randomUUID(),
    day_id: day.id,
    number: entries.length + 1,
    created_at: new Date().toISOString(),
    kind,
    amount_cents: amount,
    balance_cents: (entries.at(-1)?.balance_cents || 0) + amount,
    description,
    category: "",
    reference: "",
    document_date: today,
    actor_name: "Testmitarbeiter",
    has_document: false,
    source_key: null,
    original_id: null,
    ...extra,
  };
  entries.push(e);
  return e;
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';import PdfPreview from './components/pdf-preview';import CheckoutFlow from './components/checkout-flow';createRoot(document.getElementById('root')).render(<>{location.pathname==='/preflight'?<CheckoutFlow payload={{id:'qa-sale',payment:'cash'}} totalCents={1000} disabled={false} settings={{live_mode:false}} operatorId='qa' onBooked={()=>{}} onRefresh={async()=>{}}/>:<AdminApp section={location.pathname.split('/')[2]||'uebersicht'}/>}<PdfPreview/></>);`,
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
  const url = new URL(req.url, "http://127.0.0.1:3033");
  res.setHeader("content-type", "application/json");
  let v = {};
  if (req.method === "POST") {
    let b = "";
    for await (const c of req) b += c;
    v = JSON.parse(b);
  }
  if (url.pathname === "/api/cash-book") {
    if (url.searchParams.has("check"))
      return res.end(
        JSON.stringify({
          enabled: days.length > 0,
          open: days.some((d) => !d.closed_at),
        }),
      );
    if (url.searchParams.has("format")) {
      downloads.push(url.toString());
      res.setHeader("content-type", "application/pdf");
      return res.end(
        await readFile("output/cash-book/Elias-Kassenbuch-Monat.pdf"),
      );
    }
    if (req.method === "POST") {
      commands.push(v);
      if (readOnly) {
        res.statusCode = 403;
        return res.end('{"error":"FORBIDDEN"}');
      }
      let d = days.find((d) => d.id === v.day_id);
      if (v.action === "open") {
        d = {
          id: crypto.randomUUID(),
          day: today,
          test_mode: true,
          opening_cents: v.opening_cents,
          opened_at: new Date().toISOString(),
          opened_by: "qa",
          closed_at: null,
          closed_by: null,
          expected_cents: null,
          counted_cents: null,
          difference_cents: null,
          next_opening_cents: null,
          closing_note: "",
          transfer_note: "",
        };
        days.push(d);
        add(d, "opening", v.opening_cents, "Anfangsbestand bestätigt");
      }
      if (v.action === "movement")
        add(d, "manual", v.amount_cents, v.description, {
          category: v.category,
          reference: v.reference,
          has_document: !!v.document,
        });
      if (v.action === "close") {
        const expected = entries.at(-1).balance_cents;
        d.expected_cents = expected;
        d.counted_cents = v.counted_cents;
        d.difference_cents = v.counted_cents - expected;
        d.next_opening_cents = v.next_opening_cents;
        add(d, "difference", d.difference_cents, "Zähldifferenz");
        add(
          d,
          "float_transfer",
          v.next_opening_cents - v.counted_cents,
          "Abschöpfung: " + v.transfer_note,
        );
        d.closed_at = new Date().toISOString();
      }
      return res.end(JSON.stringify(d));
    }
    return res.end(
      JSON.stringify({
        report: buildCashBookReport(
          days,
          entries,
          url.searchParams.get("period") || today,
        ),
        allDays: days,
        settings: data.settings,
        operatorId: "qa",
        readOnly,
        pending: [],
      }),
    );
  }
  if (url.pathname === "/api/finance") {
    downloads.push(url.toString());
    res.setHeader("content-type", "text/csv");
    return res.end("Test CSV");
  }
  if (url.pathname === "/api/order-inbox")
    return res.end('{"orders":[],"revision":"1"}');
  if (url.pathname === "/api/admin") return res.end(JSON.stringify(data));
  if (url.pathname === "/api/operations") return res.end(JSON.stringify(op));
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
        url.pathname.endsWith(".mjs") ? "text/javascript" : "image/png",
      );
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
await new Promise((r) => server.listen(3033, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/cash-book", { recursive: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1024 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3033/crm/kasse");
  await page
    .getByRole("button", {
      name: "Kassenabschluss · Tagesbericht",
      exact: true,
    })
    .click();
  await page.getByLabel("Anfangsbestand heute (€)").fill("250");
  await page
    .getByRole("button", { name: "Tageskasse öffnen · Bestand bestätigen" })
    .click();
  await page
    .getByRole("button", { name: "Einlage / Entnahme mit Beleg" })
    .click();
  await page.getByLabel("Betrag (€)", { exact: true }).fill("10");
  await page.getByLabel("Verwendungszweck").fill("Porto bei Edeka");
  await page.getByLabel("Belegnummer / Papierbelegreferenz").fill("ED-123");
  await page.getByLabel(/Beleg hochladen/).setInputFiles({
    name: "Porto.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nLocal fixture"),
  });
  await page
    .getByRole("button", { name: "Bewegung verbindlich buchen" })
    .click();
  await page
    .getByRole("cell", { name: "Porto bei Edeka", exact: false })
    .waitFor();
  assert.equal(commands.at(-1).amount_cents, -1000);
  assert.ok(commands.at(-1).document.base64);
  add(days[0], "sale", 10000, "Barverkauf", "");
  await page
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bargeld zählen · Tagesabschluss" })
    .click();
  assert.equal(
    await page.getByLabel("Gezählter Barbestand (€)").inputValue(),
    "",
  );
  await page.getByLabel("Gezählter Barbestand (€)").fill("335");
  await page.getByText("Differenz: -5,00 €", { exact: true }).waitFor();
  await page.getByLabel("Wohin wird das Geld gelegt?").fill("Tresor");
  await page.getByRole("checkbox", { name: /Bargeld gezählt/ }).check();
  await page.screenshot({
    path: "output/cash-book/closing-ipad.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Tagesabschluss bestätigen", exact: true })
    .click();
  await page.getByText(/Abgeschlossen/).waitFor();
  assert.equal(commands.at(-1).counted_cents, 33500);
  assert.equal(commands.at(-1).next_opening_cents, 25000);
  assert.equal(entries.at(-1).balance_cents, 25000);
  await page.getByRole("button", { name: "PDF ansehen / drucken" }).click();
  await page.locator(".pdf-preview-pages canvas").first().waitFor();
  await page.screenshot({
    path: "output/cash-book/pdf-preview-ipad.png",
    fullPage: true,
  });
  // Verify the PDF itself and render each generated page using the app's PDF engine.
  const canvases = page.locator(".pdf-preview-pages canvas");
  for (let i = 0; i < (await canvases.count()); i++)
    await canvases
      .nth(i)
      .screenshot({ path: `output/cash-book/pdf-page-${i + 1}.png` });
  await page.goto("http://127.0.0.1:3033/preflight");
  await page.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await page
    .getByText(/Bitte unter Kassenabschluss.*zuerst die Tageskasse öffnen/)
    .waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  readOnly = true;
  data = {
    ...data,
    role: "staff",
    permissions: ["finanzen"],
    finance_readonly: true,
    name: "Steuerberater",
  };
  await page.goto("http://127.0.0.1:3033/crm/finanzen");
  await page
    .getByText(
      "Steuerberaterzugang: Lesen, Belege ansehen und exportieren. Keine Buchungsrechte.",
    )
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Einlage / Entnahme mit Beleg" })
      .count(),
    0,
  );
  await page
    .getByLabel("Kassenbuch im Tages- / Monatsbericht mit ausgeben")
    .check();
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(
    downloads.some(
      (u) => u.includes("/api/finance?") && u.includes("cashbook=1"),
    ),
  );
  await page
    .getByLabel("Kassenbuch im Tages- / Monatsbericht mit ausgeben")
    .uncheck();
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  await page.waitForTimeout(200);
  assert.ok(
    downloads.some(
      (u) => u.includes("/api/finance?") && u.includes("cashbook=0"),
    ),
  );
  await page.screenshot({
    path: "output/cash-book/accountant.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: POS opening 250 EUR, 10 EUR expense and attachment, empty count input, -5 EUR discrepancy, 85 EUR safe transfer and 250 EUR next float, closing, inline PDF, accountant readonly and optional combined export.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
