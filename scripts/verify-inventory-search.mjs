// Isolated browser -> request schema -> real SQL -> component refresh. No production access.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { inventoryRequest } from "../lib/inventory.ts";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const file of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
const actor = crypto.randomUUID();
await db.query("insert into auth.users values($1,'inventory@example.test')", [
  actor,
]);
await db.query(
  "insert into staff(user_id,role,name,permissions) values($1,'owner','Prüfteam','[]')",
  [actor],
);
await db.exec(
  "update products set stock=10,loose_stock=least(2,pack_count-1) where active",
);
const product = (
  await db.query(
    "select * from products where active and pack_count>2 order by name limit 1",
  )
).rows[0];
await db.query("update products set barcode='4001234567890' where id=$1", [
  product.id,
]);
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import InventoryPanel from './components/inventory-panel';createRoot(document.getElementById('root')).render(<main className="inventory-workspace"><InventoryPanel onStockChange={async()=>{}}/></main>);`,
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
      name: "next-image",
      setup(b) {
        b.onResolve({ filter: /^next\/image$/ }, () => ({
          path: "image",
          namespace: "mock",
        }));
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          loader: "tsx",
          resolveDir: process.cwd(),
          contents: `import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>}`,
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
  try {
    if (req.url === "/bundle.js") {
      res.setHeader("content-type", "application/javascript");
      return res.end(bundle.outputFiles[0].text);
    }
    if (req.url.startsWith("/api/inventory")) {
      res.setHeader("content-type", "application/json");
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = inventoryRequest.parse(JSON.parse(raw));
        const result = (
          await db.query("select inventory_command($1,$2,$3) value", [
            body.action,
            JSON.stringify(body.value),
            actor,
          ])
        ).rows[0].value;
        return res.end(JSON.stringify(result));
      }
      return res.end(
        JSON.stringify({
          runs: [],
          lines: [],
          events: [],
          products: (await db.query("select * from products order by name"))
            .rows,
          adjustments: (
            await db.query(
              "select * from stock_adjustments order by created_at desc",
            )
          ).rows,
          owner: true,
          canAdjust: true,
        }),
      );
    }
    res.setHeader("content-type", "text/html");
    res.end(
      `<html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{padding:24px}main{max-width:1100px;margin:auto}</style><div id="root"></div><script src="/bundle.js"></script></html>`,
    );
  } catch (error) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: error.message }));
  }
});
await new Promise((resolve) => server.listen(3027, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
try {
  await mkdir("output/inventory-search", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1366, height: 1024 },
  });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3027");
  await page
    .getByRole("button", { name: "Bruch & Bestandskorrekturen" })
    .click();
  const search = page.getByLabel("Korrekturartikel suchen");
  const submit = page.getByRole("button", {
    name: "Bestandsänderung verbindlich buchen",
  });
  assert.equal(await submit.isDisabled(), true);
  assert.equal(await page.locator(".adjustment-results button").count(), 6);
  await page.getByRole("button", { name: /Weitere Artikel anzeigen/ }).click();
  assert.equal(await page.locator(".adjustment-results button").count(), 18);
  await search.fill("does-not-exist");
  await page
    .getByRole("status")
    .filter({ hasText: "Keine passenden Artikel" })
    .waitFor();
  await search.fill("4001234567890");
  assert.equal(await page.locator(".adjustment-results button").count(), 1);
  await page.locator(`[data-product-id="${product.id}"]`).click();
  assert.equal(await submit.isDisabled(), false);
  await search.fill(product.sku);
  assert.equal(await submit.isDisabled(), true); // changed search must invalidate prior selection
  await search.press("Enter");
  assert.equal(
    (await db.query("select count(*)::int n from stock_adjustments")).rows[0].n,
    0,
  );
  await page.locator(`[data-product-id="${product.id}"]`).click();
  assert.equal(
    await page.getByLabel("Korrekturbegründung").getAttribute("required"),
    null,
  );
  await page.getByLabel("Korrekturmenge").fill("2");
  await page.screenshot({
    path: "output/inventory-search/desktop-selected.png",
    fullPage: true,
  });
  await submit.click();
  await page
    .getByText("Bestand korrigiert und Beleg erstellt.", { exact: true })
    .waitFor();
  const adjustment = (await db.query("select * from stock_adjustments"))
    .rows[0];
  assert.equal(adjustment.note, "");
  assert.equal(adjustment.reason, "breakage");
  assert.equal(adjustment.actor_name, "Prüfteam");
  assert.equal(adjustment.before_units, 10 * product.pack_count + 2);
  assert.equal(adjustment.after_units, 10 * product.pack_count);
  await page
    .locator(".adjustment-selection")
    .getByText("Bestand: 10 Geb. + 0 einzeln", { exact: true })
    .waitFor();
  for (const [name, width, height] of [
    ["ipad", 1024, 1366],
    ["phone", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Artikel ändern" }).click();
    await search.fill("Alwa");
    await page.screenshot({
      path: `output/inventory-search/${name}-search.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const first = page.locator(".adjustment-results button").first();
    await first.waitFor();
    const box = await first.boundingBox();
    assert.ok(box.height >= 44 && box.height < 200);
    await first.click();
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/iPad/phone search, EAN and SKU, pagination, empty state, selection reset, Enter safety, touch targets, optional explanation, real SQL stock deduction and audit record, live stock refresh; no browser errors.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await db.close();
}
