import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const creds = await readFile(".local/CRM-Zugang.txt", "utf8");
const password = creds.match(/Temporäres Passwort: (.+)/)[1];
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
await mkdir("output/qa", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Gute Getränke. Gute Nachbarschaft." })
    .waitFor();
  await page.screenshot({
    path: "output/qa/website-desktop.png",
    fullPage: true,
  });
  assert.equal(
    await page.locator("iframe").count(),
    0,
    "Map loads only on consent",
  );
  await page
    .getByRole("link", { name: "Sortiment entdecken", exact: true })
    .click();
  await page.getByLabel("Getränke suchen").fill("Paulaner Spezi");
  await page
    .getByRole("button", { name: "Paulaner Spezi zur Auswahl hinzufügen" })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Lieferanfrage senden" })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Paulaner Spezi mehr" })
    .click({ clickCount: 3 });
  assert.equal(
    await page
      .getByRole("button", { name: "Lieferanfrage senden" })
      .isDisabled(),
    false,
  );
  await page.getByRole("button", { name: "Warenkorb schließen" }).click();
  await page.goto(base + "/crm");
  await page.waitForURL("**/login");
  await page.getByLabel("E-Mail-Adresse").fill("info@getraenke-elias.de");
  await page.getByLabel("Passwort", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL("**/crm");
  await page.getByText("Artikel im Sortiment", { exact: true }).waitFor();
  await page.screenshot({ path: "output/qa/crm-desktop.png", fullPage: true });
  await page
    .getByRole("link", { name: "Artikel & Lager", exact: true })
    .click();
  await page
    .getByPlaceholder("Name, Artikelnummer oder Barcode")
    .fill("Ensinger Mineralwasser");
  await page.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.getByLabel("Artikelname", { exact: true }).inputValue(),
    "Ensinger Mineralwasser",
  );
  await page.getByRole("button", { name: "Artikel speichern" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByText("Artikel gespeichert. Bestellbedarf geprüft.").waitFor();
  await page.getByPlaceholder("Name, Artikelnummer oder Barcode").fill("");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF-Liste" }).click();
  const download = await downloadPromise;
  await download.saveAs("output/qa/Elias-Artikelliste.pdf");
  await page.getByRole("link", { name: "Finanzen", exact: true }).click();
  await page.getByText("Testumsatz brutto", { exact: true }).waitFor();
  await page.screenshot({
    path: "output/qa/finanzen-desktop.png",
    fullPage: true,
  });
  for (const route of [
    "/crm/kasse",
    "/crm/bestellungen",
    "/crm/einkauf",
    "/crm/lieferanten",
    "/crm/einstellungen",
  ]) {
    await page.goto(base + route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(await page.locator("[data-nextjs-dialog]").count(), 0, route);
  }
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(base + "/crm/kasse");
  await page.getByText("Aktueller Testbon", { exact: true }).waitFor();
  await page.screenshot({ path: "output/qa/kasse-ipad.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "iPad overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of [
    "/",
    "/sortiment",
    "/kontakt",
    "/crm",
    "/crm/einstellungen",
  ]) {
    await page.goto(base + route);
    await page.getByRole("heading", { level: 1 }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `mobile overflow ${route}`,
    );
    if (route === "/")
      await page.screenshot({
        path: "output/qa/website-mobile.png",
        fullPage: true,
      });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile/iPad render; map consent; cart minimum; auth guard/login; article read/write; PDF download; all CRM routes; no JS errors/overflow.",
  );
} finally {
  await browser.close();
}
