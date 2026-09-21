// Real register components + catalog, isolated HTTP data. No production login or sale.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const products = JSON.parse(await readFile("data/catalog.json", "utf8"));
products[0].barcode = "4000123456789";
const data = {
  operatorId: "isolated-register",
  products,
  suppliers: [],
  orders: [],
  sales: [],
  purchases: [],
  closings: [],
  mail: [],
  role: "owner",
  permissions: [],
  name: "Elias Team",
  settings: { live_mode: false, discount_percent: 10 },
  pendingReceipt: null,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AdminApp from './components/admin-app';createRoot(document.getElementById('root')).render(<AdminApp section={location.pathname==='/crm'?'uebersicht':'kasse'}/>);`,
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
const posts = [];
const server = createServer(async (req, res) => {
  if (req.url === "/api/admin") {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      posts.push(JSON.parse(body));
      res.statusCode = 400;
      res.end(
        JSON.stringify({
          error: "Isolierter Test: keine Buchung",
          booking_failed: true,
        }),
      );
    } else res.end(JSON.stringify(data));
    return;
  }
  if (req.url.startsWith("/api/")) {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        employees: [],
        customers: [],
        invoices: [],
        deliveries: [],
        subscriptions: [],
      }),
    );
    return;
  }
  if (req.url === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
    return;
  }
  if (/^\/(images|products)\/[\w.\-]+$/.test(req.url)) {
    try {
      res.setHeader(
        "content-type",
        req.url.endsWith(".gif")
          ? "image/gif"
          : req.url.endsWith(".svg")
            ? "image/svg+xml"
            : "image/png",
      );
      res.end(await readFile("public" + req.url));
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(
    `<html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script src="/app.js"></script></body></html>`,
  );
});
await new Promise((r) => server.listen(3019, "127.0.0.1", r));
if (process.env.QA_SERVE_ONLY) {
  console.log("Isolated POS workspace http://127.0.0.1:3019/crm/kasse");
  await new Promise(() => {});
}
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/pos", { recursive: true });
try {
  const ctx = await browser.newContext({
      viewport: { width: 1194, height: 834 },
    }),
    page = await ctx.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3019/crm");
  const popupPromise = ctx.waitForEvent("page");
  await page
    .getByRole("navigation", { name: "Verwaltung" })
    .getByRole("link", { name: "Kasse", exact: true })
    .click();
  const pos = await popupPromise;
  pos.on("pageerror", (e) => errors.push(e.message));
  await pos.waitForURL("**/crm/kasse");
  assert.ok(page.url().endsWith("/crm"));
  await pos
    .getByRole("heading", { name: "Was darf es sein?", exact: true })
    .waitFor();
  assert.equal(await pos.locator(".pos-products button:visible").count(), 0);
  await pos.getByRole("button", { name: /^Wasser \d+ Artikel$/ }).click();
  await pos.getByRole("button", { name: /^Alwa / }).click();
  await pos
    .getByRole("heading", { name: "Alwa · Varianten", exact: true })
    .waitFor();
  const variant = pos
    .locator(".pos-products button")
    .filter({ has: pos.locator(".pos-variant", { hasText: /^Medium$/ }) })
    .first();
  const sku = await variant.locator("small").first().textContent();
  const product = products.find((p) => sku.includes(p.sku));
  await variant.click();
  assert.equal(await pos.locator(".pos-item").count(), 1);
  assert.ok(
    (await pos.locator(".pos-item").textContent()).includes(product.name),
  );
  await pos.getByRole("button", { name: /^Pfandrücknahme/ }).click();
  await pos.getByRole("button", { name: /^Mehrwegflasche/ }).click();
  assert.match(await pos.locator(".pos-return-line").textContent(), /1 × 0,15/);
  await pos.getByRole("button", { name: /^% Rabatt/ }).click();
  await pos.getByRole("button", { name: "Warenkorb", exact: true }).click();
  await pos.getByLabel("Warenkorbrabatt (%)", { exact: true }).fill("20");
  assert.match(await pos.locator(".discount-saving").textContent(), /Rabatt/);
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await pos.getByRole("alert").filter({ hasText: "Isolierter Test" }).waitFor();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].value.lines[0].id, product.id);
  assert.equal(posts[0].value.discount, 20);
  assert.deepEqual(posts[0].value.returns, [
    { deposit_cents: 15, quantity: 1 },
  ]);
  await pos.reload();
  await pos
    .getByRole("heading", { name: "Was darf es sein?", exact: true })
    .waitFor();
  const search = pos.getByLabel("Artikel oder Barcode suchen");
  for (const p of products
    .filter((p) => p.active && p.deposit_cents !== null)
    .slice(0, 18)) {
    await search.fill(p.sku);
    await pos.locator(".pos-products button").first().click();
  }
  await search.fill("");
  await pos.getByRole("button", { name: "Karte", exact: true }).click();
  const geometry = [];
  for (const [width, height] of [
    [1366, 1024],
    [1194, 834],
    [1024, 768],
    [834, 1194],
    [768, 1024],
    [390, 844],
  ]) {
    await pos.setViewportSize({ width, height });
    await pos.waitForTimeout(100);
    const g = await pos.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s).getBoundingClientRect();
        return {
          x: b.x,
          y: b.y,
          right: b.right,
          bottom: b.bottom,
          width: b.width,
          height: b.height,
        };
      };
      return {
        viewport: [innerWidth, innerHeight],
        doc: [
          document.documentElement.scrollWidth,
          document.documentElement.scrollHeight,
        ],
        catalog: r(".pos-workspace"),
        cart: r(".pos-cart"),
        pay: r(".pos-checkout > button.button"),
        lines: r(".pos-cart-lines"),
        lineOverflow:
          document.querySelector(".pos-cart-lines").scrollHeight >
          document.querySelector(".pos-cart-lines").clientHeight,
      };
    });
    assert.ok(
      g.cart.x >= g.catalog.right,
      `cart right ${width}: ${JSON.stringify(g)}`,
    );
    assert.ok(
      g.cart.bottom <= height + 1 && g.pay.bottom <= height,
      `payment in viewport ${width}: ${JSON.stringify(g)}`,
    );
    assert.ok(
      g.doc[0] <= width && g.doc[1] <= height + 1,
      `page overflow ${width}: ${JSON.stringify(g)}`,
    );
    assert.ok(
      g.lines.height >= 60 && g.lineOverflow,
      `independent receipt scroll ${width}`,
    );
    geometry.push(g);
    await pos.screenshot({ path: `output/pos/cart-${width}.png` });
  }
  await pos.setViewportSize({ width: 1194, height: 834 });
  await pos.getByRole("button", { name: "Bon leeren", exact: true }).click();
  await pos.getByRole("button", { name: /^Wasser \d+ Artikel$/ }).click();
  await pos.getByRole("button", { name: /^Alwa / }).click();
  await pos.waitForFunction(() =>
    [...document.querySelectorAll(".pos-products img")].every(
      (i) => i.complete && i.naturalWidth > 0,
    ),
  );
  await pos.screenshot({ path: "output/pos/alwa-variants.png" });
  await pos.getByRole("button", { name: /^Pfandrücknahme/ }).click();
  await pos.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("elias:native-scan", {
        detail: { barcode: "4000123456789" },
      }),
    ),
  );
  await search.waitFor({ state: "visible" });
  assert.equal(await search.inputValue(), "4000123456789");
  assert.equal(await pos.locator(".pos-products button").count(), 1);
  await pos.evaluate(() => {
    window.nativeMessages = [];
    window.eliasNative = { version: 1, app: "pos" };
    window.webkit = {
      messageHandlers: {
        elias: {
          postMessage: async (m) => {
            window.nativeMessages.push(m);
            return { ok: true };
          },
        },
      },
    };
  });
  await pos
    .getByRole("button", { name: "Scannen / Suchen", exact: true })
    .click();
  await pos.getByRole("button", { name: "Drucker", exact: true }).click();
  assert.deepEqual(
    await pos.evaluate(() => window.nativeMessages.map((m) => m.type)),
    ["pos.scan", "pos.printer"],
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "output/pos/verification.json",
    JSON.stringify(
      {
        passed: true,
        geometry,
        booking_payload: posts[0].value,
        console_errors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: separate register window, category → brand → variant, exact SKU booking payload, Pfand and discount, six responsive viewports, fixed cart + payment with 18 lines, native scan/printer bridge, no JavaScript errors. No production writes.",
  );
} finally {
  await browser.close();
  server.close();
}
