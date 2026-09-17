import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = "http://localhost:3017";
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/address-verification", { recursive: true });
const fill = async (p, a) => {
  for (const [label, key] of [
    ["Straße", "street"],
    ["Hausnummer", "house_number"],
    ["Postleitzahl", "postal_code"],
    ["Ort", "city"],
  ])
    await p.getByLabel(label, { exact: true }).fill(a[key]);
};
const address = {
  street: "Äußere Straße",
  house_number: "12 a",
  postal_code: "01234",
  city: "Bad Musterstadt",
};
try {
  const owner = await browser.newContext();
  const p = await owner.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base + "/login");
  await p.getByLabel("E-Mail-Adresse oder Benutzername").fill("global_admin");
  await p
    .getByLabel("Passwort", { exact: true })
    .fill("LocalOnly-Validation-2026");
  await p.getByRole("button", { name: "Anmelden", exact: true }).click();
  await p.waitForURL("**/crm");
  await p.goto(base + "/crm/kunden");
  await p.getByRole("button", { name: "Kunde anlegen", exact: true }).click();
  await p.getByRole("group", { name: "Lieferadresse", exact: true }).waitFor();
  await p.getByLabel("Name / Firma", { exact: true }).fill("Adressprüfung CRM");
  await p.getByLabel("E-Mail", { exact: true }).fill("address@example.test");
  await p.getByLabel("Telefon", { exact: true }).fill("0713100000");
  await fill(p, address);
  await p.screenshot({ path: "output/address-verification/crm.png" });
  await p
    .getByRole("button", { name: "Kunden speichern", exact: true })
    .click();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  let d = await (await owner.request.get(base + "/api/operations")).json();
  let c = d.customers.find((c) => c.email === "address@example.test");
  assert.ok(c);
  for (const k of Object.keys(address)) assert.equal(c[k], address[k]);
  assert.equal(c.address, "Äußere Straße 12 a, 01234 Bad Musterstadt");
  const customer = await browser.newContext({
    viewport: { width: 820, height: 1180 },
  });
  const cp = await customer.newPage();
  cp.on("pageerror", (e) => errors.push(e.message));
  await cp.goto(base + "/konto");
  await cp.getByLabel("E-Mail", { exact: true }).fill("customer@example.test");
  await cp
    .getByLabel("Passwort", { exact: true })
    .fill("LocalOnly-Validation-2026");
  await cp
    .locator("form")
    .getByRole("button", { name: "Anmelden", exact: true })
    .click();
  await cp.getByRole("button", { name: "Profil & Lieferzeiten" }).click();
  await cp.getByLabel("Straße", { exact: true }).waitFor();
  assert.equal(
    await cp.getByLabel("Straße", { exact: true }).inputValue(),
    "Wartbergstraße",
  );
  assert.equal(
    await cp.getByLabel("Hausnummer", { exact: true }).inputValue(),
    "3",
  );
  await fill(cp, address);
  await cp
    .getByRole("button", { name: "Profil speichern", exact: true })
    .click();
  await cp.getByText("Gespeichert.", { exact: true }).waitFor();
  await cp.reload();
  await cp.getByRole("button", { name: "Profil & Lieferzeiten" }).click();
  assert.equal(
    await cp.getByLabel("Postleitzahl", { exact: true }).inputValue(),
    "01234",
  );
  await cp.screenshot({ path: "output/address-verification/customer.png" });
  const bad = await customer.request.post(base + "/api/customer", {
    headers: { Origin: base },
    data: {
      action: "profile",
      value: {
        ...(await (await customer.request.get(base + "/api/customer")).json())
          .customer,
        postal_code: "1234",
      },
    },
  });
  assert.equal(bad.status(), 400);
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const gp = await guest.newPage();
  gp.on("pageerror", (e) => errors.push(e.message));
  await gp.goto(base + "/sortiment");
  await gp.getByRole("button", { name: "Limonade", exact: true }).click();
  await gp
    .getByLabel("Sorte Alwa Limonade", { exact: true })
    .selectOption("elias-036-v1");
  await gp
    .getByRole("button", {
      name: "Alwa Limonade Orange zur Auswahl hinzufügen",
    })
    .click();
  await gp.getByRole("dialog").waitFor();
  for (let i = 0; i < 3; i++)
    await gp
      .getByRole("button", { name: "Alwa Limonade Orange mehr", exact: true })
      .click();
  await gp.getByLabel("Name", { exact: true }).fill("Adressprüfung Gast");
  await gp
    .getByLabel("E-Mail", { exact: true })
    .fill("guest-address@example.test");
  await gp.getByLabel("Telefon", { exact: true }).fill("07131999999");
  await fill(gp, address);
  await gp.getByLabel("Postleitzahl", { exact: true }).fill("1234");
  assert.equal(
    await gp
      .getByLabel("Postleitzahl", { exact: true })
      .evaluate((e) => e.checkValidity()),
    false,
  );
  await gp.getByLabel("Postleitzahl", { exact: true }).fill("01234");
  await gp
    .getByRole("group", { name: "Lieferadresse", exact: true })
    .scrollIntoViewIfNeeded();
  await gp.screenshot({
    path: "output/address-verification/checkout-mobile.png",
  });
  assert.ok(
    await gp.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  for (const checkbox of await gp
    .getByRole("dialog")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  const response = gp.waitForResponse(
    (r) => r.url() === base + "/api/orders" && r.request().method() === "POST",
  );
  await gp.getByRole("button", { name: "Lieferanfrage senden" }).click();
  assert.equal((await response).status(), 201);
  d = await (await owner.request.get(base + "/api/admin")).json();
  const order = d.orders.find((o) => o.email === "guest-address@example.test");
  for (const k of Object.keys(address)) assert.equal(order[k], address[k]);
  assert.equal(order.address, c.address);
  d = await (await owner.request.get(base + "/api/operations")).json();
  const gc = d.customers.find((c) => c.email === "guest-address@example.test");
  assert.equal(gc.postal_code, "01234");
  assert.deepEqual(errors, []);
  console.log(
    "PASS CRM customer creation, legacy profile prefill, profile edit/reload, required postcode validation, mobile guest checkout → structured customer and order snapshots; no browser errors",
  );
} catch (e) {
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  await browser.close();
}
