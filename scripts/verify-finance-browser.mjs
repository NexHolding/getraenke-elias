// Uses the authorized finance-reader account; never changes business records.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const { username, password } = JSON.parse(
  await readFile(".local/accountant-credentials.json", "utf8"),
);
const base = process.env.QA_BASE || "http://127.0.0.1:3017";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/finance", { recursive: true });
try {
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/login");
  await p
    .getByLabel("E-Mail-Adresse oder Benutzername", { exact: true })
    .fill(username);
  await p.getByLabel("Passwort", { exact: true }).fill(password);
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForURL("**/crm/finanzen");
  await p.getByRole("heading", { name: "Finanzen", exact: true }).waitFor();
  await p
    .getByRole("navigation", { name: "Verwaltung" })
    .getByRole("link", { name: "Finanzen", exact: true })
    .waitFor();
  assert.deepEqual(
    await p
      .getByRole("navigation", { name: "Verwaltung" })
      .getByRole("link")
      .allTextContents(),
    ["Finanzen"],
  );
  assert.equal(
    await p
      .getByRole("button", {
        name: /Monatsabschluss|Tagesabschluss|Abschluss aktualisieren|Zahlungseingang buchen/,
      })
      .count(),
    0,
  );
  const adminResponse = await ctx.request.get(base + "/api/admin");
  assert.equal(adminResponse.status(), 200);
  const data = await adminResponse.json();
  assert.deepEqual(data.permissions, ["finanzen"]);
  assert.equal(data.finance_readonly, true);
  for (const key of ["products", "suppliers", "orders", "purchases", "mail"])
    assert.deepEqual(data[key], []);
  const ops = await (await ctx.request.get(base + "/api/operations")).json();
  assert.deepEqual(ops.employees, []);
  assert.deepEqual(ops.customers, []);
  for (const [path, action] of [
    ["/api/admin", "closing"],
    ["/api/admin", "settings"],
    ["/api/admin", "sale"],
    ["/api/operations", "invoice-paid"],
    ["/api/operations", "employee"],
  ]) {
    const res = await ctx.request.post(base + path, {
      headers: { Origin: base },
      data: { action, value: {}, id: crypto.randomUUID() },
    });
    assert.equal(res.status(), 403, `${path} ${action}`);
  }
  const inv = await ctx.request.get(base + "/api/inventory");
  assert.equal(inv.status(), 403);
  const sale = data.sales[0];
  if (sale) {
    const res = await ctx.request.post(base + "/api/receipts/" + sale.id, {
      headers: { Origin: base },
      data: { action: "digital", value: { consent: true } },
    });
    assert.equal(res.status(), 403);
  }
  const month = "2026-09";
  await p.getByLabel("Auswertungszeitraum", { exact: true }).fill(month);
  for (const format of ["CSV", "PDF"]) {
    const [d] = await Promise.all([
      p.waitForEvent("download"),
      p.getByRole("button", { name: format, exact: true }).click(),
    ]);
    await d.saveAs(
      `output/finance/${base.startsWith("https") ? "live" : "local"}-monat.${format.toLowerCase()}`,
    );
  }
  const csv = await readFile(
    `output/finance/${base.startsWith("https") ? "live" : "local"}-monat.csv`,
    "utf8",
  );
  assert.match(csv, /Beleg-ID/);
  assert.match(csv, /Netto 19% EUR/);
  await p.getByRole("button", { name: "Tag", exact: true }).click();
  await p.getByLabel("Auswertungszeitraum", { exact: true }).fill("2026-09-17");
  const [day] = await Promise.all([
    p.waitForEvent("download"),
    p.getByRole("button", { name: "PDF", exact: true }).click(),
  ]);
  await day.saveAs(
    `output/finance/${base.startsWith("https") ? "live" : "local"}-tag.pdf`,
  );
  await p.screenshot({
    path: `output/finance/${base.startsWith("https") ? "live" : "local"}-advisor.png`,
    fullPage: true,
  });
  await p.goto(base + "/crm/einstellungen");
  await p.waitForURL("**/crm/finanzen");
  await p.getByRole("heading", { name: "Finanzen", exact: true }).waitFor();
  await p.setViewportSize({ width: 1194, height: 834 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  const invalid = await ctx.request.get(
    base + "/api/finance?period=2026-02-30&format=pdf",
  );
  assert.equal(invalid.status(), 400);
  const anon = await browser.newContext();
  assert.equal(
    (
      await anon.request.get(base + "/api/finance?period=2026-09&format=csv")
    ).status(),
    401,
  );
  assert.deepEqual(errors, []);
  await ctx.request.post(base + "/api/auth/signout", {
    headers: { Origin: base },
  });
  await writeFile(
    "output/finance/verification.json",
    JSON.stringify(
      {
        base,
        username,
        permissions: data.permissions,
        finance_readonly: true,
        finance_only_navigation: true,
        exports: ["month pdf", "month csv", "day pdf"],
        mutations_denied: true,
        console_errors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: username login, finance-only landing/navigation, month PDF/CSV and day PDF downloads, read-only API enforcement, no inventory/settings access, anonymous export blocked, invalid period rejected, tablet layout, no JavaScript errors. No business mutations performed.",
  );
} finally {
  await browser.close();
}
