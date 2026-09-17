// Isolated browser harness: real form, mock API; no accounts, email or production writes.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import ManualPurchase from './components/manual-purchase';const products=[{id:'cola',name:'Cola Test',sku:'COLA-1',barcode:'1234',active:true,supplier_id:'supplier-a',pack_count:12,volume_ml:1000},{id:'other',name:'Anderer Lieferant',sku:'OTHER',active:true,supplier_id:'supplier-b',pack_count:6,volume_ml:1000}];createRoot(document.getElementById('root')).render(<ManualPurchase products={products} suppliers={[{id:'supplier-a',name:'Testlieferant',email:'test@example.test'}]} reload={async()=>{window.reloadCount=(window.reloadCount||0)+1}}/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
});
const css = await readFile("app/globals.css", "utf8");
const server = createServer((req, res) => {
  if (req.url === "/app.js") {
    res.setHeader("content-type", "text/javascript");
    res.end(bundle.outputFiles[0].contents);
  } else {
    res.setHeader("content-type", "text/html");
    res.end(
      `<html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/^@import.*$/gm, "")}:root{--font-geist:Arial}body{padding:24px}#root{max-width:1120px;margin:auto}</style><body><main id="root"></main><script src="/app.js"></script></body></html>`,
    );
  }
});
await new Promise((r) => server.listen(3018, "127.0.0.1", r));
if (process.env.QA_SERVE_ONLY) {
  console.log("Isolated manual purchase form at http://127.0.0.1:3018");
  await new Promise(() => {});
}
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/manual-purchases", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1194, height: 834 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const posts = [];
  let fail = true;
  await page.route("**/api/admin", async (route) => {
    posts.push(route.request().postDataJSON());
    await new Promise((r) => setTimeout(r, 120));
    await route.fulfill({
      status: fail ? 400 : 200,
      json: fail
        ? { error: "Testfehler: Bitte erneut versuchen." }
        : { id: "12345678-test" },
    });
  });
  await page.goto("http://127.0.0.1:3018");
  await page
    .getByRole("button", { name: "Zusatzbestellung anlegen", exact: true })
    .click();
  await page.getByLabel("Artikel suchen", { exact: true }).fill("COLA-1");
  const select = page.getByRole("combobox", {
    name: "Artikel zur Zusatzbestellung hinzufügen",
  });
  assert.equal(await select.locator("option").count(), 2);
  await select.selectOption("cola");
  await page
    .getByRole("spinbutton", { name: "Bestellmenge Cola Test" })
    .fill("100");
  await page
    .getByLabel("Bezug / Kundenauftrag (optional)", { exact: true })
    .fill("100 Kisten für Kundenauftrag");
  await page
    .getByLabel("Hinweise an den Lieferanten", { exact: true })
    .fill("Zusätzliche Lieferung");
  const d = new Date();
  d.setDate(d.getDate() + 7);
  await page
    .getByLabel("Gewünschter Liefertermin (optional)", { exact: true })
    .fill(d.toISOString().slice(0, 10));
  for (const width of [1194, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `No overflow ${width}`,
    );
    await page.screenshot({
      path: `output/manual-purchases/form-${width}.png`,
      fullPage: true,
    });
  }
  const save = page.getByRole("button", {
    name: "Zusatzbestellung als Entwurf speichern",
    exact: true,
  });
  await save.click();
  await page.getByRole("status").filter({ hasText: "Testfehler" }).waitFor();
  assert.equal(posts[0].action, "purchase-create");
  assert.equal(posts[0].value.items[0].quantity, 100);
  assert.equal(posts[0].value.supplier_id, "supplier-a");
  fail = false;
  await save.click();
  await page
    .getByRole("status")
    .filter({ hasText: "als Entwurf angelegt" })
    .waitFor();
  assert.equal(posts.length, 2);
  assert.equal(
    posts[0].value.request_id,
    posts[1].value.request_id,
    "Retry uses same id",
  );
  assert.equal(await page.evaluate(() => window.reloadCount), 1);
  assert.equal(await page.locator("form").count(), 0);
  await page
    .getByRole("button", { name: "Zusatzbestellung anlegen", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Bezug / Kundenauftrag (optional)", { exact: true })
      .inputValue(),
    "",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 100 crates, supplier filter, SKU search, metadata, responsive layouts, error/retry idempotency, refresh and new-form reset; no browser errors.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
