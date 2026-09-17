// Real Next.js checkout + isolated native channel/API responses. Never places production orders.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = "http://127.0.0.1:3017",
  id = "59a41a78-2696-4a11-8e01-cc07a96671fa";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/ios", { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const product = {
    id: "cola",
    name: "QA Cola",
    sku: "QA-01",
    category: "Limonade",
    pack_count: 12,
    volume_ml: 1000,
    price_cents: 1199,
    deposit_cents: 330,
    tax_rate: 19,
    active: true,
    kind: "beverage",
  };
  const posted = [];
  let status = 503;
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/catalog")
      return route.fulfill({
        json: { products: [product], guest_orders: true },
      });
    if (path === "/api/customer")
      return route.fulfill({ status: 401, json: { error: "Bitte anmelden." } });
    if (path === "/api/orders") {
      posted.push(route.request().postDataJSON());
      return route.fulfill({
        status,
        json:
          status === 201
            ? { number: "EL-99999" }
            : { error: "Verbindung unklar. Erneut versuchen." },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Isolated verification" },
    });
  });
  await context.addInitScript(
    ({ id }) => {
      window.nativeMessages = [];
      window.nativeInvalid = false;
      window.eliasNative = { version: 1, app: "customer" };
      window.webkit = {
        messageHandlers: {
          elias: {
            postMessage: async (message) => {
              window.nativeMessages.push(message);
              if (message.type === "checkout.load")
                return {
                  version: 1,
                  request_id: id,
                  items: window.nativeInvalid
                    ? [{ id: "missing", quantity: 4 }]
                    : [{ id: "cola", quantity: 4 }],
                };
              return { ok: true };
            },
          },
        },
      };
    },
    { id },
  );
  const p = await context.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/app/bestellen");
  const dialog = p.getByRole("dialog", { name: "Deine Getränkeauswahl" });
  await dialog.waitFor();
  await p.getByLabel("Name", { exact: true }).fill("QA App");
  await p.getByLabel("E-Mail", { exact: true }).fill("qa@example.test");
  await p.getByLabel("Telefon", { exact: true }).fill("07131000000");
  for (const [label, value] of [
    ["Straße", "Teststraße"],
    ["Hausnummer", "1"],
    ["Postleitzahl", "74076"],
    ["Ort", "Heilbronn"],
  ])
    await p.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole("checkbox").nth(0).check();
  await dialog.getByRole("checkbox").nth(1).check();
  const submit = dialog.getByRole("button", {
    name: "Lieferanfrage senden",
    exact: true,
  });
  await submit.click();
  await p
    .getByRole("status")
    .filter({ hasText: "Verbindung unklar" })
    .waitFor();
  let messages = await p.evaluate(() => window.nativeMessages);
  assert.equal(
    messages.filter((x) => x.type === "checkout.submitting").length,
    1,
  );
  assert.equal(
    messages.some((x) => x.type === "checkout.completed"),
    false,
  );
  assert.equal(
    messages.some((x) => x.type === "checkout.rejected"),
    false,
  );
  assert.equal(posted[0].request_id, id);
  assert.deepEqual(posted[0].items, [{ id: "cola", quantity: 4 }]);
  assert.equal("price_cents" in posted[0].items[0], false);
  assert.equal(
    await dialog
      .getByRole("button", { name: "QA Cola mehr", exact: true })
      .isDisabled(),
    true,
  );
  status = 400;
  await submit.click();
  await p.waitForFunction(() =>
    window.nativeMessages.some((m) => m.type === "checkout.rejected"),
  );
  assert.equal(
    await dialog
      .getByRole("button", { name: "QA Cola mehr", exact: true })
      .isEnabled(),
    true,
  );
  status = 201;
  await submit.click();
  await p.getByRole("status").filter({ hasText: "EL-99999" }).waitFor();
  assert.equal(posted[0].request_id, posted[1].request_id);
  messages = await p.evaluate(() => window.nativeMessages);
  assert.equal(
    messages.filter((x) => x.type === "checkout.completed").length,
    1,
  );
  assert.equal(
    messages.find((x) => x.type === "checkout.completed").number,
    "EL-99999",
  );
  await p.screenshot({
    path: "output/ios/checkout-confirmed.png",
    fullPage: true,
  });
  // Unknown products clear any previous browser cart and cannot accidentally submit stale lines.
  const invalid = await browser.newContext();
  await invalid.route("**/api/**", (route) =>
    route.fulfill({ json: { products: [product] } }),
  );
  await invalid.addInitScript(
    ({ id }) => {
      window.eliasNative = { version: 1, app: "customer" };
      window.webkit = {
        messageHandlers: {
          elias: {
            postMessage: async () => ({
              version: 1,
              request_id: id,
              items: [{ id: "missing", quantity: 4 }],
            }),
          },
        },
      };
      sessionStorage.setItem(
        "elias-cart",
        JSON.stringify([
          {
            product: { id: "stale", name: "Stale", price_cents: 1 },
            quantity: 4,
          },
        ]),
      );
    },
    { id },
  );
  const ip = await invalid.newPage();
  await ip.goto(base + "/app/bestellen");
  await ip
    .getByRole("status")
    .filter({ hasText: "nicht mehr verfügbar" })
    .waitFor();
  assert.equal(
    await ip.evaluate(() => sessionStorage.getItem("elias-cart")),
    "[]",
  );
  await invalid.close();
  // Exercise the actual Epson client through the native transport; no network printer used.
  const bundle = await build({
    stdin: {
      contents:
        "import {probePrinter} from './lib/epson-client';window.probePrinter=probePrinter;",
      loader: "ts",
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: "browser",
  });
  await p.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await p.evaluate(async () => {
    window.eliasNative = { version: 1, app: "pos" };
    window.webkit.messageHandlers.elias.postMessage = async (message) => {
      window.lastPrint = message;
      return '<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="0"/>';
    };
    return window.probePrinter({ printer_address: "https://192.168.1.20" });
  });
  assert.equal(result.nearEnd, false);
  const print = await p.evaluate(() => window.lastPrint);
  assert.equal(print.type, "printer.send");
  assert.ok(print.body.includes("<epos-print"));
  assert.equal(print.body.includes("<cut"), false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: native cart import, live price lookup, separate delivery fields, ambiguous-response retry identity, completion ACK, stale-cart rejection, native Epson probe transport; no real orders/emails/printing.",
  );
  await context.close();
} finally {
  await browser.close();
}
