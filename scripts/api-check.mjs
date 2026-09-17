import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split("\n")
    .filter((s) => /^[A-Z_]+=/.test(s))
    .map((s) => {
      const i = s.indexOf("=");
      return [s.slice(0, i), s.slice(i + 1).replace(/^"|"$/g, "")];
    }),
);
const db = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
const anon = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
const reqId = randomUUID();
const qaId = "qa-" + randomUUID();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  assert.equal((await fetch(base + "/api/admin")).status, 401);
  assert.equal((await fetch(base + "/api/cron/reorder")).status, 401);
  const publicRead = await anon.from("orders").select("*");
  assert.deepEqual(publicRead.data, []);
  const forbidden = await anon
    .from("products")
    .update({ price_cents: 1 })
    .eq("id", "elias-001")
    .select();
  assert.deepEqual(forbidden.data, []);
  const rpc = await anon.rpc("generate_reorders");
  assert.ok(rpc.error);
  const order = {
    request_id: reqId,
    customer_name: "AUTOMATISCHER FUNKTIONSTEST",
    email: "qa@example.invalid",
    phone: "000000000",
    address: "TESTDATEN – keine Lieferung",
    adult: "on",
    website: "",
    notes: "QA: wird nach Test entfernt",
    items: [{ id: "elias-001", quantity: 4, price_cents: 1 }],
  };
  const post = (v) =>
    fetch(base + "/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify(v),
    });
  const invalid = await post({
    ...order,
    items: [{ id: "elias-001", quantity: 3 }],
  });
  assert.equal(invalid.status, 400);
  const accepted = await post(order);
  assert.equal(accepted.status, 201, await accepted.clone().text());
  const result = await accepted.json();
  const repeated = await post(order);
  assert.equal((await repeated.json()).number, result.number);
  const { data: stored } = await db
    .from("orders")
    .select("*")
    .eq("request_id", reqId)
    .single();
  assert.equal(stored.items[0].price_cents, 990, "Server ignores client price");
  await page.goto(base + "/login");
  const creds = await readFile(".local/CRM-Zugang.txt", "utf8");
  await page.getByLabel("E-Mail-Adresse").fill("info@getraenke-elias.de");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill(creds.match(/Temporäres Passwort: (.+)/)[1]);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL("**/crm");
  const response = await context.request.get(base + "/api/admin");
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.ok(data.orders.some((o) => o.request_id === reqId));
  assert.equal("smtp_secret" in data.settings, false);
  const qa = {
    ...data.products[0],
    id: qaId,
    sku: qaId,
    name: "QA temporary product",
    active: false,
    stock: 0,
    revision: undefined,
  };
  const api = (action, payload) =>
    context.request.post(base + "/api/admin", {
      headers: { Origin: base },
      data: { action, ...payload },
    });
  const created = await api("product", { value: qa });
  assert.equal(created.status(), 200, await created.text());
  const { data: product } = await db
    .from("products")
    .select("*")
    .eq("id", qaId)
    .single();
  const update = await api("product", {
    value: { ...product, name: "QA changed" },
  });
  assert.equal(update.status(), 200, await update.text());
  const stale = await api("product", {
    value: { ...product, name: "QA stale" },
  });
  assert.equal(stale.status(), 400, "Stale writes blocked");
  const bad = await api("supplier", {
    value: {
      id: "demo-supplier",
      name: "Demo-Lieferant",
      email: "qa@example.invalid",
      phone: "",
      is_demo: true,
      auto_send: true,
    },
  });
  assert.equal(bad.status(), 400, "Demo supplier mail blocked");
  const cross = await context.request.post(base + "/api/admin", {
    headers: { Origin: "https://attacker.invalid" },
    data: { action: "reorder" },
  });
  assert.equal(cross.status(), 403);
  console.log(
    "PASS: public RLS and RPC isolation; auth and CSRF; server price integrity; minimum order; order idempotence; inquiry persistence; optimistic product concurrency; demo email guard; no secret disclosure.",
  );
} finally {
  await db.from("orders").delete().eq("request_id", reqId);
  await db.from("stock_movements").delete().eq("product_id", qaId);
  await db.from("products").delete().eq("id", qaId);
  await browser.close();
}
