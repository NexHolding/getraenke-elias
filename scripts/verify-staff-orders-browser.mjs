// Uses temporary QA customer/employee from .local/staff-order-qa.json. Never sends mail or posts stock/financial transactions.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
process.loadEnvFile(".env.local");
const base = process.env.QA_BASE || "http://localhost:3017",
  fixture = JSON.parse(await readFile(".local/staff-order-qa.json", "utf8"));
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const cfg = await db.from("settings").select("value").eq("id", 1).single();
assert.ifError(cfg.error);
assert.equal(cfg.data.value.smtp_enabled, false, "QA must not send email");
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/staff-orders", { recursive: true });
const ctx = await browser.newContext({
  viewport: { width: 1194, height: 834 },
});
await ctx.addCookies(
  fixture.jar.map((c) => ({ name: c.name, value: c.value, url: base })),
);
let ownerAuth;
const errors = [];
try {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/crm/bestellungen");
  await p
    .getByRole("button", { name: "Bestellung anlegen", exact: true })
    .click();
  await p
    .getByLabel("Kunden suchen", { exact: true })
    .fill("QA Lieferautomatik");
  await p.getByLabel("Kunde", { exact: true }).selectOption(fixture.customer);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  const first = date.toISOString().slice(0, 10);
  await p.getByLabel("Erster Liefertermin", { exact: true }).fill(first);
  await p
    .getByLabel("Lieferintervall", { exact: true })
    .selectOption("biweekly");
  await p
    .getByLabel("Lieferhinweis", { exact: true })
    .fill("QA: Lieferung an der Seitentür");
  await p
    .getByLabel("Artikel suchen", { exact: true })
    .fill("Alwa Limonade Orange");
  const options = await p
    .getByLabel("Artikel hinzufügen", { exact: true })
    .locator("option")
    .allTextContents();
  assert.ok(options.some((t) => t.includes("Alwa Limonade Orange")));
  const id = await p
    .getByLabel("Artikel hinzufügen", { exact: true })
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await p.getByLabel("Artikel hinzufügen", { exact: true }).selectOption(id);
  const qty = p.getByRole("spinbutton", { name: /Menge Alwa Limonade Orange/ });
  await qty.fill("1.5");
  assert.equal(
    await p.locator(".staff-order-form").count(),
    1,
    "Fractional input does not crash rendering",
  );
  await qty.fill("4");
  for (const [w, h] of [
    [1194, 834],
    [834, 1194],
    [390, 844],
  ]) {
    await p.setViewportSize({ width: w, height: h });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      "No horizontal overflow at " + w,
    );
    await p.screenshot({
      path: `output/staff-orders/${base.startsWith("https") ? "live" : "local"}-form-${w}.png`,
      fullPage: true,
    });
  }
  await p.setViewportSize({ width: 1194, height: 834 });
  const request = p.waitForRequest(
    (r) => r.url().endsWith("/api/operations") && r.method() === "POST",
  );
  await p
    .getByRole("button", {
      name: "Bestellung verbindlich anlegen",
      exact: true,
    })
    .click();
  const posted = (await request).postDataJSON();
  await p
    .getByRole("status")
    .filter({ hasText: /Bestellung EL-.*angelegt/ })
    .waitFor();
  const stored = await db
    .from("orders")
    .select("*")
    .eq("request_id", posted.value.request_id)
    .single();
  assert.ifError(stored.error);
  assert.equal(stored.data.customer_id, fixture.customer);
  assert.equal(stored.data.created_by, fixture.staff);
  assert.equal(stored.data.status, "confirmed");
  assert.equal(stored.data.items[0].quantity, 4);
  assert.equal(stored.data.requested_delivery_date, first);
  assert.equal(stored.data.delivery_date, null);
  const retried = await ctx.request.post(base + "/api/operations", {
    data: posted,
    headers: { Origin: base },
  });
  assert.equal(retried.status(), 200);
  assert.equal((await retried.json()).id, stored.data.id);
  let sub = await db
    .from("subscriptions")
    .select("*")
    .eq("id", stored.data.subscription_id)
    .single();
  assert.ifError(sub.error);
  assert.equal(sub.data.interval, "biweekly");
  const expected = new Date(first + "T12:00:00Z");
  expected.setUTCDate(expected.getUTCDate() + 14);
  assert.equal(sub.data.next_date, expected.toISOString().slice(0, 10));
  await p.locator(".staff-subscriptions summary").click();
  const row = p
    .locator(".staff-subscription")
    .filter({ hasText: "QA Lieferautomatik" });
  await row.getByRole("button", { name: "Pausieren", exact: true }).click();
  await p
    .getByRole("status")
    .filter({ hasText: /Lieferautomatik pausiert/ })
    .waitFor();
  assert.equal(
    (
      await db
        .from("subscriptions")
        .select("active")
        .eq("id", sub.data.id)
        .single()
    ).data.active,
    false,
  );
  await row
    .getByRole("button", { name: "Bearbeiten / Fortsetzen", exact: true })
    .click();
  await p.getByLabel("Lieferautomatik aktiv", { exact: true }).check();
  await p.getByLabel("Lieferintervall", { exact: true }).selectOption("weekly");
  await p
    .getByRole("button", { name: "Lieferautomatik speichern", exact: true })
    .click();
  await p
    .getByRole("status")
    .filter({ hasText: /Lieferautomatik gespeichert/ })
    .waitFor();
  const updated = (
    await db.from("subscriptions").select("*").eq("id", sub.data.id).single()
  ).data;
  assert.equal(updated.active, true);
  assert.equal(updated.interval, "weekly");
  const stale = await ctx.request.post(base + "/api/operations", {
    data: { action: "staff-subscription", value: sub.data },
    headers: { Origin: base },
  });
  assert.equal(stale.status(), 400);
  assert.match((await stale.json()).error, /zwischenzeitlich/);
  // Single order through owner access, current prices cannot be forged by client.
  const link = await db.auth.admin.generateLink({
    type: "magiclink",
    email: "info@getraenke-elias.de",
  });
  assert.ifError(link.error);
  let jar = [];
  ownerAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar,
        setAll: (v) => {
          jar = v;
        },
      },
    },
  );
  assert.ifError(
    (
      await ownerAuth.auth.verifyOtp({
        type: "email",
        token_hash: link.data.properties.hashed_token,
      })
    ).error,
  );
  const ownerCtx = await browser.newContext();
  await ownerCtx.addCookies(
    jar.map((c) => ({ name: c.name, value: c.value, url: base })),
  );
  const single = {
    ...posted.value,
    request_id: crypto.randomUUID(),
    interval: null,
    items: [{ id, quantity: 1, price_cents: 1 }],
  };
  const ownerResult = await ownerCtx.request.post(base + "/api/operations", {
    data: { action: "staff-order", value: single },
    headers: { Origin: base },
  });
  assert.equal(ownerResult.status(), 200, await ownerResult.text());
  const singleOrder = (
    await db
      .from("orders")
      .select("*")
      .eq("request_id", single.request_id)
      .single()
  ).data;
  assert.equal(singleOrder.subscription_id, null);
  assert.notEqual(singleOrder.items[0].price_cents, 1);
  // Staff without the module and finance-only accounts cannot call the mutation directly.
  await db
    .from("staff")
    .update({ permissions: [] })
    .eq("user_id", fixture.staff);
  let deny = await ctx.request.post(base + "/api/operations", {
    data: {
      action: "staff-order",
      value: { ...single, request_id: crypto.randomUUID() },
    },
    headers: { Origin: base },
  });
  assert.equal(deny.status(), 403);
  await db
    .from("staff")
    .update({ permissions: ["bestellungen"], finance_readonly: true })
    .eq("user_id", fixture.staff);
  deny = await ctx.request.post(base + "/api/operations", {
    data: {
      action: "staff-order",
      value: { ...single, request_id: crypto.randomUUID() },
    },
    headers: { Origin: base },
  });
  assert.equal(deny.status(), 403);
  await db
    .from("staff")
    .update({ permissions: ["bestellungen"], finance_readonly: false })
    .eq("user_id", fixture.staff);
  assert.equal(
    (
      await fetch(base + "/api/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "staff-order", value: single }),
      })
    ).status,
    401,
  );
  const cross = await ctx.request.post(base + "/api/operations", {
    data: posted,
    headers: { Origin: "https://untrusted.example" },
  });
  assert.equal(cross.status(), 403);
  const list = await ctx.request.get(base + "/api/operations");
  const listData = await list.json();
  assert.ok(listData.customers.every((c) => !c.email.includes("global_admin")));
  assert.equal(listData.employees.length, 0);
  await p.screenshot({
    path: `output/staff-orders/${base.startsWith("https") ? "live" : "local"}-completed.png`,
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "output/staff-orders/" +
      (base.startsWith("https") ? "live" : "local") +
      "-verification.json",
    JSON.stringify(
      {
        base,
        employee_order_only: true,
        owner_one_time: true,
        duplicate_request_prevented: true,
        server_prices: true,
        recurring_biweekly: true,
        pause_edit_resume: true,
        stale_edit_rejected: true,
        permissions_enforced: true,
        global_admin_hidden: true,
        tablet_mobile_no_overflow: true,
        browser_errors: errors,
        no_email_sent: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: browser → API → Supabase → UI, employee/customer selection, quantities, trusted prices, dates, single owner order, 14-day recurrence, duplicate retry, pause/edit/resume, stale revision, access and Origin denial, mobile/tablet layout. No email or stock posting.",
  );
} finally {
  await ownerAuth?.auth.signOut({ scope: "local" });
  await browser.close();
  // Only the dedicated QA customer's orders and subscriptions are removed.
  for (const table of ["orders", "subscriptions"]) {
    const r = await db.from(table).delete().eq("customer_id", fixture.customer);
    assert.ifError(r.error);
  }
  await db
    .from("staff")
    .update({ permissions: ["bestellungen"], finance_readonly: false })
    .eq("user_id", fixture.staff);
  console.log("Temporary QA orders and subscriptions removed.");
}
