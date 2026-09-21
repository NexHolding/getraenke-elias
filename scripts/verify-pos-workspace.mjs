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
let bookingMode = "reject";
const receipts = new Map();
const server = createServer(async (req, res) => {
  if (req.url === "/api/admin") {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const posted = JSON.parse(body);
      posts.push(posted);
      if (bookingMode === "reject") {
        res.statusCode = 400;
        res.end(
          JSON.stringify({
            error: "Isolierter Test: keine Buchung",
            booking_failed: true,
          }),
        );
      } else {
        const v = posted.value;
        if (!receipts.has(v.id)) {
          const total =
            v.lines.reduce((sum, line) => {
              const p = products.find((p) => p.id === line.id);
              return (
                sum +
                line.quantity *
                  (Math.round(
                    (p.price_cents *
                      (100 - (v.discount || line.discount_percent || 0))) /
                      100,
                  ) +
                    p.deposit_cents)
              );
            }, 0) -
            v.returns.reduce((sum, r) => sum + r.quantity * r.deposit_cents, 0);
          receipts.set(v.id, {
            id: v.id,
            number: receipts.size + 1,
            items: [],
            total_cents: total,
            payment: v.payment,
            test_mode: true,
          });
        }
        await new Promise((r) => setTimeout(r, 180));
        if (bookingMode === "lose-once") {
          bookingMode = "success";
          res.statusCode = 503;
          res.end(
            JSON.stringify({
              error: "Unklarer Buchungsstatus im isolierten Test",
            }),
          );
        } else res.end(JSON.stringify(receipts.get(v.id)));
      }
    } else res.end(JSON.stringify(data));
    return;
  }
  if (req.url.startsWith("/api/receipts/")) {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        sale: receipts.get(req.url.split("/").pop()),
        workflow: { stage: "done", public_token: null },
        jobs: [],
        archived_at: new Date().toISOString(),
      }),
    );
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
  // Day always returns to today's Berlin business date, even from an old month
  // or after the open page crosses midnight. Historical dates remain selectable.
  await page.clock.setFixedTime(new Date("2026-09-21T22:30:00Z"));
  await page.goto("http://127.0.0.1:3019/crm/finanzen");
  const periodInput = page.getByLabel("Auswertungszeitraum", { exact: true });
  await periodInput.fill("2024-01");
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  assert.equal(await periodInput.inputValue(), "2026-09-22");
  await periodInput.fill("2026-08-15");
  assert.equal(await periodInput.inputValue(), "2026-08-15");
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  assert.equal(await periodInput.inputValue(), "2026-09-22");
  await page.clock.setFixedTime(new Date("2026-09-22T22:30:00Z"));
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  assert.equal(await periodInput.inputValue(), "2026-09-23");
  const exportRequest = page.waitForRequest((request) => request.url().includes("/api/finance?"));
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  assert.ok((await exportRequest).url().includes("period=2026-09-23"));
  await page.screenshot({ path: "output/pos/finance-today.png", fullPage: true });
  await page.clock.setFixedTime(new Date());
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
  assert.equal(
    await pos
      .getByRole("button", { name: "Bezahlen", exact: true })
      .isEnabled(),
    false,
  );
  await pos
    .getByRole("button", { name: "Bezahlen", exact: true })
    .evaluate((b) => b.click());
  assert.equal(posts.length, 0);
  assert.equal(await pos.getByRole("dialog").count(), 0);
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
  await pos.getByRole("button", { name: "Artikel", exact: true }).click();
  await pos
    .getByRole("heading", { name: "Was darf es sein?", exact: true })
    .waitFor();
  await pos.getByRole("button", { name: /^Bier \d+ Artikel$/ }).click();
  await pos.getByRole("button", { name: /^Augustiner / }).click();
  await pos.getByRole("button", { name: "Artikel", exact: true }).click();
  await pos
    .getByRole("heading", { name: "Was darf es sein?", exact: true })
    .waitFor();
  assert.equal(await pos.locator(".pos-item").count(), 1);
  await pos.locator(".pos-item-discount").click();
  const rate = pos.getByLabel("Artikelrabatt (%)", { exact: true });
  assert.equal(await rate.inputValue(), "");
  await rate.pressSequentially("25");
  assert.equal(await rate.inputValue(), "25");
  await pos.screenshot({ path: "output/pos/item-discount.png" });
  await pos
    .getByRole("button", { name: "Artikelrabatt übernehmen", exact: true })
    .click();
  assert.match(await pos.locator(".pos-item-discount").textContent(), /25 %/);
  await pos.locator(".pos-item-discount").click();
  await rate.fill("");
  assert.equal(await rate.inputValue(), "");
  assert.equal(
    await pos
      .getByRole("button", { name: "Artikelrabatt übernehmen", exact: true })
      .isEnabled(),
    false,
  );
  await pos
    .getByRole("button", { name: "Rabattfenster schließen", exact: true })
    .click();
  await pos.getByRole("button", { name: /^Pfandrücknahme/ }).click();
  const returned = pos.getByLabel("Rückgabe Mehrwegflasche", { exact: true });
  assert.equal(await returned.inputValue(), "");
  await returned.pressSequentially("12");
  assert.equal(await returned.inputValue(), "12");
  await returned.fill("");
  assert.equal(await returned.inputValue(), "");
  await pos.getByRole("button", { name: /^Mehrwegflasche/ }).click();
  assert.match(await pos.locator(".pos-return-line").textContent(), /1 × 0,15/);
  await pos.getByRole("button", { name: /^% Rabatt/ }).click();
  await pos.getByRole("button", { name: "Warenkorb", exact: true }).click();
  const cartRate = pos.getByLabel("Warenkorbrabatt (%)", { exact: true });
  await cartRate.fill("101");
  assert.equal(await cartRate.inputValue(), "100");
  await cartRate.fill("");
  assert.equal(await cartRate.inputValue(), "");
  await pos.getByLabel("Warenkorbrabatt (%)", { exact: true }).fill("20");
  assert.match(await pos.locator(".discount-saving").textContent(), /Rabatt/);
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  const given = pos.getByLabel("Vom Kunden gegeben (€)", { exact: true });
  assert.equal(posts.length, 0);
  assert.equal(await given.inputValue(), "");
  await given.fill("5");
  assert.equal(
    await pos
      .getByRole("button", { name: "Barzahlung abschließen", exact: true })
      .isEnabled(),
    false,
  );
  await given.fill("20,00");
  assert.match(await pos.locator(".cash-change").textContent(), /6,93/);
  await pos.screenshot({ path: "output/pos/cash-payment.png" });
  for (const [width, height] of [
    [1194, 834],
    [1024, 600],
    [834, 1194],
    [390, 844],
  ]) {
    await pos.setViewportSize({ width, height });
    await pos
      .getByRole("button", { name: "Barzahlung abschließen", exact: true })
      .scrollIntoViewIfNeeded();
    const box = await pos.getByRole("dialog").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height,
      `Payment dialog ${width}×${height}`,
    );
    assert.equal(
      await pos.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await pos.screenshot({ path: `output/pos/cash-payment-${width}.png` });
  }
  await pos.setViewportSize({ width: 1194, height: 834 });

  await pos
    .getByRole("button", { name: "Zurück zum Bon", exact: true })
    .click();
  assert.equal(posts.length, 0);
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  assert.equal(await given.inputValue(), "");
  await given.fill("20");
  await pos
    .getByRole("button", { name: "Barzahlung abschließen", exact: true })
    .click();
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
  // Card confirmation: amount shown, no checkbox and no booking before success.
  await pos.getByRole("button", { name: "Bon leeren", exact: true }).click();
  await search.fill(product.sku);
  await pos.locator(".pos-products button").first().click();
  await pos.getByRole("button", { name: "Karte", exact: true }).click();
  assert.equal(
    await pos.locator('.pos-checkout input[type="checkbox"]').count(),
    0,
  );
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  assert.match(await pos.locator(".payment-amount").textContent(), /15,40/);
  assert.equal(posts.length, 1);
  await pos.screenshot({ path: "output/pos/card-payment.png" });
  await pos
    .getByRole("button", { name: "Zurück zum Bon", exact: true })
    .click();
  assert.equal(posts.length, 1);
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await pos
    .getByRole("button", { name: "EC-Kartenzahlung erfolgreich", exact: true })
    .click();
  await pos.getByRole("alert").filter({ hasText: "Isolierter Test" }).waitFor();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].value.payment, "card");
  // Refund-only and a zero-sum basket are explicit, separate confirmation states.
  await pos.getByRole("button", { name: "Bon leeren", exact: true }).click();
  await pos.getByRole("button", { name: /^Pfandrücknahme/ }).click();
  await pos.getByRole("button", { name: /^Mehrwegflasche/ }).click();
  await pos.getByRole("button", { name: "Bar", exact: true }).click();
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await pos
    .getByRole("heading", { name: "Barauszahlung", exact: true })
    .waitFor();
  assert.equal(await pos.getByLabel("Vom Kunden gegeben (€)").count(), 0);
  await pos
    .getByRole("button", { name: "Auszahlung bestätigt", exact: true })
    .click();
  await pos.getByRole("alert").filter({ hasText: "Isolierter Test" }).waitFor();
  assert.equal(posts.length, 3);
  await pos.getByRole("button", { name: "Bon leeren", exact: true }).click();
  await pos.getByRole("button", { name: "Artikel", exact: true }).click();
  const freeDeposit = products.find(
    (p) => p.active && p.deposit_cents === 0 && p.price_cents > 0,
  );
  await search.fill(freeDeposit.sku);
  await pos.locator(".pos-products button").first().click();
  await pos.locator(".pos-item-discount").click();
  await rate.fill("100");
  await pos
    .getByRole("button", { name: "Artikelrabatt übernehmen", exact: true })
    .click();
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await pos
    .getByRole("heading", { name: "Betrag ausgeglichen", exact: true })
    .waitFor();
  await pos
    .getByRole("button", { name: "Zurück zum Bon", exact: true })
    .click();
  assert.equal(posts.length, 3);
  // Successful booking and repeated taps: a single record and receipt, change stays visible.
  await pos.getByRole("button", { name: "Bon leeren", exact: true }).click();
  await search.fill(product.sku);
  await pos.locator(".pos-products button").first().click();
  bookingMode = "success";
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await given.fill("20");
  await pos
    .getByRole("button", { name: "Barzahlung abschließen", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await pos
    .getByRole("heading", { name: "Bon ausgegeben", exact: true })
    .waitFor();
  assert.equal(posts.length, 4);
  assert.equal(receipts.size, 1);
  assert.match(
    await pos.locator(".cash-receipt-summary").textContent(),
    /Rückgeld 4,60/,
  );
  await pos
    .getByRole("button", { name: "Fertig · Nächster Kunde", exact: true })
    .click();
  assert.equal(
    await pos
      .getByRole("button", { name: "Bezahlen", exact: true })
      .isEnabled(),
    false,
  );
  // Lost response: same id/body after reload, without another payment confirmation.
  await search.fill(product.sku);
  await pos.locator(".pos-products button").first().click();
  bookingMode = "lose-once";
  await pos.getByRole("button", { name: "Bezahlen", exact: true }).click();
  await given.fill("20");
  await pos
    .getByRole("button", { name: "Barzahlung abschließen", exact: true })
    .click();
  await pos
    .getByRole("heading", { name: "Buchungsstatus prüfen", exact: true })
    .waitFor();
  await pos.reload();
  await pos
    .getByRole("heading", { name: "Buchungsstatus prüfen", exact: true })
    .waitFor();
  assert.equal(await pos.getByLabel("Vom Kunden gegeben (€)").count(), 0);
  await pos
    .getByRole("button", { name: "Buchungsstatus erneut prüfen", exact: true })
    .click();
  await pos
    .getByRole("heading", { name: "Bon ausgegeben", exact: true })
    .waitFor();
  assert.equal(posts.length, 6);
  assert.deepEqual(posts[4].value, posts[5].value);
  assert.equal(receipts.size, 2);
  await pos
    .getByRole("button", { name: "Fertig · Nächster Kunde", exact: true })
    .click();
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
  // No discount controls for an employee without the discount permission.
  data.role = "staff";
  data.permissions = ["kasse"];
  await pos.reload();
  await pos
    .getByRole("heading", { name: "Was darf es sein?", exact: true })
    .waitFor();
  await pos.getByLabel("Artikel oder Barcode suchen").fill(product.sku);
  await pos.locator(".pos-products button").first().click();
  assert.equal(await pos.locator(".pos-item-discount").count(), 0);
  assert.equal(await pos.getByRole("button", { name: /^% Rabatt/ }).count(), 0);
  data.role = "owner";
  data.permissions = [];
  await page.goto("http://127.0.0.1:3019/crm/artikel");
  await page
    .getByRole("button", { name: "Neuer Artikel", exact: true })
    .click();
  const price = page.getByLabel("Bruttopreis (€)", { exact: true });
  assert.equal(await price.inputValue(), "");
  await price.pressSequentially("0.25");
  assert.equal(await price.inputValue(), "0.25");
  await price.fill("");
  assert.equal(await price.inputValue(), "");
  await price.pressSequentially("25");
  assert.equal(await price.inputValue(), "25");
  await page
    .getByRole("button", { name: "Dialog schließen", exact: true })
    .click();
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
    "PASS: separate window, article reset, blank zero fields, per-item discount dialog, cash/change and EC confirmation, cancel/empty/refund/zero flows, double-click protection, recovery after reload with identical ID/body, receipt change display, six viewports and native bridge. No production writes.",
  );
} catch (error) {
  for (const context of browser.contexts())
    for (const page of context.pages())
      if (page.url().includes("/crm/kasse"))
        await page.screenshot({ path: "output/pos/failure.png" });
  throw error;
} finally {
  await browser.close();
  server.close();
}
