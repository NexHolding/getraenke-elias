import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = "http://localhost:3017";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/inventory-verification", { recursive: true });
const post = async (ctx, path, body, status = 200) => {
  const r = await ctx.request.post(base + path, {
    data: body,
    headers: { Origin: base },
  });
  const d = await r.json();
  assert.equal(r.status(), status, JSON.stringify(d));
  return d;
};
const get = async (ctx, id = "") => {
  const r = await ctx.request.get(
    base + "/api/inventory" + (id ? "?id=" + id : ""),
  );
  assert.equal(r.status(), 200);
  return r.json();
};
const login = async (ctx, id) => {
  const p = await ctx.newPage();
  await p.goto(base + "/login");
  await p.getByLabel("E-Mail-Adresse oder Benutzername").fill(id);
  await p
    .getByLabel("Passwort", { exact: true })
    .fill("LocalOnly-Validation-2026");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForURL("**/crm");
  return p;
};
try {
  const anon = await browser.newContext();
  assert.equal((await anon.request.get(base + "/api/inventory")).status(), 401);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const p = await login(ctx, "global_admin");
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/crm/inventur");
  await p
    .getByRole("heading", { name: "Dein Bestand, nachvollziehbar." })
    .waitFor();
  await p
    .getByRole("button", { name: "Inventur starten", exact: true })
    .click();
  await p.getByLabel("Bezeichnung", { exact: true }).fill("Abnahme Inventur");
  await p
    .getByRole("button", { name: "Zählliste mit allen Artikeln erstellen" })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.getByLabel("Gezählte Gebinde").fill("99");
  await p.getByLabel("Differenzgrund").selectOption("breakage");
  await p.getByLabel("Netto-Einkaufswert").fill("12.50");
  await p.getByLabel("Inventurnotiz").fill("Test: beschädigte Ware separiert.");
  await p.getByRole("button", { name: "Speichern & weiter" }).click();
  await p
    .getByText("Zählung gespeichert. Bestand noch nicht verändert.")
    .waitFor();
  let d = await get(ctx);
  const r = d.runs[0];
  d = await get(ctx, r.id);
  assert.equal(d.lines.length, 149);
  const first = d.lines.find((l) => l.counted_units !== null);
  assert.ok(first);
  assert.equal(d.products.find((x) => x.id === first.product_id).stock, 100);
  await p
    .getByRole("button", { name: "Artikel ergänzen", exact: true })
    .click();
  await p
    .getByLabel("Artikelname", { exact: true })
    .fill("Zzz Inventurfund Saft");
  await p.getByLabel("Kategorie", { exact: true }).selectOption("Saft");
  await p.getByLabel("Einheiten je Gebinde").fill("6");
  await p.getByLabel("Inhalt je Einheit (ml)").fill("330");
  await p.getByRole("button", { name: "Zur Inventur hinzufügen" }).click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p.getByLabel("Inventurartikel suchen").fill("Zzz Inventurfund");
  await p.getByLabel("Gezählte Gebinde").fill("2");
  await p.getByLabel("Netto-Einkaufswert").fill("3.99");
  await p.getByRole("button", { name: "Speichern & weiter" }).click();
  await p
    .getByText("Zählung gespeichert. Bestand noch nicht verändert.")
    .waitFor();
  d = await get(ctx, r.id);
  const added = d.products.find((x) => x.name === "Zzz Inventurfund Saft");
  assert.ok(added && !added.active);
  assert.equal(d.lines.length, 150);
  // Complete remaining rows through the same authenticated API; actual UI count flow was exercised above.
  for (const l of d.lines.filter((l) => l.counted_units === null)) {
    const prod = d.products.find((x) => x.id === l.product_id);
    await post(ctx, "/api/inventory", {
      action: "count",
      value: {
        run_id: r.id,
        line_id: l.id,
        revision: l.revision,
        stock_version: prod.stock_version,
        packs: 100,
        loose: 0,
        cost_net_cents: 600,
        reason: "none",
        note: "",
      },
    });
  }
  await post(ctx, "/api/admin", {
    action: "sale",
    value: {
      id: crypto.randomUUID(),
      lines: [{ id: first.product_id, quantity: 1 }],
      returns: [],
      payment: "cash",
      discount: 0,
    },
  });
  await p.getByLabel("Inventurartikel suchen").fill("");
  await p
    .locator(".inventory-workspace")
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await p.getByRole("button", { name: "Zur Prüfung vorlegen" }).click();
  await p
    .getByRole("button", { name: "Bestand übernehmen …", exact: true })
    .waitFor();
  // Tablet employee can review/count but cannot apply or write off goods without the separate grant.
  const directory = await (
    await ctx.request.get(base + "/api/operations")
  ).json();
  const employee = directory.employees.find(
    (x) => x.email === "cashier@example.test",
  );
  await post(ctx, "/api/operations", {
    action: "employee",
    value: { ...employee, permissions: ["inventur"], pin: undefined },
  });
  const mobile = await browser.newContext({
    viewport: { width: 820, height: 1180 },
    isMobile: true,
    hasTouch: true,
  });
  const mp = await login(mobile, "cashier@example.test");
  await mp.goto(base + "/crm/inventur");
  await mp.getByRole("button", { name: /Abnahme Inventur/ }).click();
  await mp.getByText("150 / 150", { exact: true }).waitFor();
  assert.equal(
    await mp
      .getByRole("button", { name: "Bestand übernehmen …", exact: true })
      .count(),
    0,
  );
  const current = (await get(ctx, r.id)).runs.find((x) => x.id === r.id);
  await post(
    mobile,
    "/api/inventory",
    {
      action: "apply",
      value: {
        run_id: r.id,
        revision: current.revision,
        confirmation: "BESTAND ÜBERNEHMEN",
      },
    },
    403,
  );
  await post(
    mobile,
    "/api/inventory",
    {
      action: "adjust",
      value: {
        id: crypto.randomUUID(),
        product_id: first.product_id,
        delta_units: -1,
        reason: "breakage",
        note: "Keine Freigabe",
        occurred_on: r.inventory_date,
      },
    },
    403,
  );
  await p
    .getByRole("button", { name: "Zur Zählung zurück", exact: true })
    .click();
  await mp.reload();
  await mp.getByRole("button", { name: /Abnahme Inventur/ }).click();
  await mp.getByLabel("Gezählte Gebinde").waitFor();
  assert.ok(
    await mp.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await mp.screenshot({
    path: "output/inventory-verification/tablet-count.png",
    fullPage: true,
  });
  await mp.getByRole("button", { name: "Zur Prüfung vorlegen" }).click();
  await mp
    .getByText(
      "Zählung zur Prüfung vorgelegt. Der Bestand ist noch unverändert.",
    )
    .waitFor();
  await p
    .locator(".inventory-workspace")
    .getByRole("button", { name: "Aktualisieren", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Bestand übernehmen …", exact: true })
    .click();
  const confirm = p.getByRole("button", {
    name: "Ja, neuen Warenbestand festlegen",
    exact: true,
  });
  assert.equal(await confirm.isDisabled(), true);
  await p.getByRole("checkbox").check();
  await confirm.click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await p
    .getByText("Neuer Bestand übernommen. Inventurbericht ist verfügbar.")
    .waitFor();
  d = await get(ctx, r.id);
  assert.equal(d.products.find((x) => x.id === first.product_id).stock, 98);
  assert.equal(d.products.find((x) => x.id === added.id).stock, 2);
  assert.equal(
    d.lines.find((x) => x.product_id === first.product_id).movement_since_count,
    -first.product_snapshot.pack_count,
  );
  const pdf = await ctx.request.get(`${base}/api/inventory/${r.id}?format=pdf`);
  assert.equal(pdf.status(), 200);
  assert.ok(pdf.headers()["content-type"].includes("application/pdf"));
  await writeFile(
    "output/inventory-verification/inventory.pdf",
    await pdf.body(),
  );
  const csv = await ctx.request.get(`${base}/api/inventory/${r.id}?format=csv`);
  assert.equal(csv.status(), 200);
  assert.ok((await csv.text()).includes("Abgeschlossen"));
  await writeFile(
    "output/inventory-verification/inventory.csv",
    await csv.body(),
  );
  assert.equal(
    (await anon.request.get(`${base}/api/inventory/${r.id}`)).status(),
    401,
  );
  await p.getByRole("button", { name: "Bruch & Bestandskorrekturen" }).click();
  await p
    .getByLabel("Korrekturartikel suchen")
    .fill(first.product_snapshot.sku);
  await p.locator(`[data-product-id="${first.product_id}"]`).click();
  await p.getByLabel("Korrekturmenge").fill("1");
  // Supplementary explanation is optional; the reason still documents the event.
  await p
    .getByRole("button", { name: "Bestandsänderung verbindlich buchen" })
    .click();
  await p.getByText("Bestand korrigiert und Beleg erstellt.").waitFor();
  d = await get(ctx);
  assert.equal(d.adjustments.length, 1);
  assert.equal(
    d.products.find((x) => x.id === first.product_id).loose_stock,
    first.product_snapshot.pack_count - 1,
  );
  const adj = d.adjustments[0];
  const apdf = await ctx.request.get(
    `${base}/api/inventory/${adj.id}?kind=adjustment`,
  );
  assert.equal(apdf.status(), 200);
  await writeFile(
    "output/inventory-verification/adjustment.pdf",
    await apdf.body(),
  );
  await p.screenshot({
    path: "output/inventory-verification/adjustments.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Gegenbuchung …", exact: true }).click();
  await p
    .getByLabel("Begründung", { exact: true })
    .fill("Irrtümliche Doppelmeldung korrigiert.");
  await p
    .getByRole("button", { name: "Gegenbuchung verbindlich speichern" })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  d = await get(ctx);
  assert.equal(d.adjustments.length, 2);
  assert.equal(d.products.find((x) => x.id === first.product_id).stock, 98);
  assert.equal(
    d.products.find((x) => x.id === first.product_id).loose_stock,
    0,
  );
  const catalog = await (await anon.request.get(base + "/api/catalog")).json();
  assert.ok(
    catalog.products.every(
      (p) => p.cost_net_cents === null && p.stock === null,
    ),
  );
  assert.ok(!catalog.products.some((p) => p.id === added.id));
  assert.doesNotMatch(
    await p.locator("body").innerText(),
    /global_admin|Global Administrator/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS full UI → API → SQL inventory: 149 + new article, count without stock change, employee tablet permissions, owner checkbox, sale reconciliation, PDF/CSV, breakage, counterbooking, public data isolation, no browser errors",
  );
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
}
