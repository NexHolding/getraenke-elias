// Isolated browser coverage: no real registration, order, subscription or email.
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { registrationDeliveryDetails } from "../lib/customer-delivery-defaults.ts";
import { registrationProfileSchema } from "../lib/registration.ts";
import { customerSchema } from "../lib/operations-validation.ts";
import { subscriptionCommandSchema } from "../lib/subscriptions.ts";
const fixture = JSON.parse(
  await readFile("output/delivery-flow/fixtures.json", "utf8"),
);
let account = null,
  signupMetadata = null;
const commands = [];
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Account from './app/konto/page';createRoot(document.getElementById('root')).render(<Account/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(
      "https://isolated.example.test",
    ),
    "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY":
      JSON.stringify("isolated-test"),
  },
  bundle: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  tsconfig: "tsconfig.json",
  plugins: [
    {
      name: "isolated-framework",
      setup(b) {
        b.onResolve(
          { filter: /^(next\/(navigation|link|image)|@supabase\/ssr)$/ },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          resolveDir: process.cwd(),
          loader: "tsx",
          contents:
            a.path === "@supabase/ssr"
              ? `export function createBrowserClient(){return {auth:{signUp:async (value)=>(await fetch('/qa/signup',{method:'POST',body:JSON.stringify(value)})).json(),signOut:async()=>{},resend:async()=>({error:null})}}}`
              : a.path === "next/navigation"
                ? `export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)}export function useRouter(){return {push:(url)=>location.assign(url),refresh:()=>{}}}`
                : a.path === "next/link"
                  ? `import React from 'react';export default function Link(p){return <a {...p}/>}`
                  : `import React from 'react';export default function Image({fill,priority,unoptimized,loader,...p}){return <img {...p}/>}`,
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
    const path = new URL(req.url, "http://127.0.0.1:3032").pathname;
    res.setHeader("content-type", "application/json");
    const body = async () => {
      let text = "";
      for await (const b of req) text += b;
      return JSON.parse(text);
    };
    if (path === "/qa/signup") {
      const v = await body();
      signupMetadata = registrationProfileSchema.parse(v.options.data);
      account = {
        customer: {
          ...fixture.customer,
          id: crypto.randomUUID(),
          user_id: crypto.randomUUID(),
          name: signupMetadata.name,
          email: v.email,
          ...registrationDeliveryDetails(signupMetadata),
        },
        orders: [],
        deliveries: [],
        invoices: [],
        subscriptions: [],
      };
      res.end(
        JSON.stringify({
          data: { session: {}, user: { id: account.customer.user_id } },
          error: null,
        }),
      );
      return;
    }
    if (path === "/api/customer") {
      if (!account) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "UNAUTHORIZED" }));
        return;
      }
      if (req.method === "POST") {
        const b = await body();
        if (b.action === "profile")
          account.customer = {
            ...account.customer,
            ...customerSchema.parse(b.value),
          };
        else if (b.action === "delivery-subscription") {
          const v = subscriptionCommandSchema.parse(b.value);
          commands.push(v);
          account.subscriptions = [{ ...v, revision: 0, last_error: null }];
        } else throw Error("Unexpected action");
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      res.end(JSON.stringify(account));
      return;
    }
    if (path === "/api/catalog") {
      res.end(
        JSON.stringify({ products: fixture.products, guest_orders: true }),
      );
      return;
    }
    if (path === "/app.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
      return;
    }
    if (path.startsWith("/images/") || path.startsWith("/products/")) {
      try {
        res.setHeader(
          "content-type",
          path.endsWith(".svg") ? "image/svg+xml" : "image/png",
        );
        res.end(await readFile("public" + path));
      } catch {
        res.statusCode = 404;
        res.end();
      }
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(
      `<html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}:root{--font-geist:Arial}body{margin:0}</style><body><div id="root"></div><script>window.eliasNative={app:'customer',version:1};window.webkit={messageHandlers:{elias:{postMessage:async()=>null}}}</script><script src="/app.js"></script></body></html>`,
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
});
await new Promise((r) => server.listen(3032, "127.0.0.1", r));
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/registration-address", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3032/konto");
  await page.getByRole("button", { name: "Registrieren", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Adressprüfung");
  await page.getByLabel("Telefon für die Lieferung").fill("0123456789");
  for (const [key, value] of Object.entries({
    street: "Teststraße",
    house_number: "12 a",
    postal_code: "01234",
    city: "Musterstadt",
  }))
    await page.locator(`input[name="${key}"]`).fill(value);
  await page.getByLabel("E-Mail", { exact: true }).fill("qa@example.test");
  await page
    .getByLabel("Passwort", { exact: true })
    .fill("Only-local-test-2026");
  await page.getByLabel(/Passwort wiederholen/).fill("Only-local-test-2026");
  await page.getByRole("checkbox").check();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "output/registration-address/registration-iphone.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Konto erstellen", exact: true })
    .click();
  try {
    await page
      .getByRole("heading", { name: "Dein Bestellverlauf" })
      .waitFor({ timeout: 10000 });
  } catch (e) {
    console.log("Signup diagnostic", {
      signupMetadata,
      body: await page.locator("body").innerText(),
      errors,
    });
    throw e;
  }
  assert.equal(signupMetadata.postal_code, "01234");
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page
    .getByText("Teststraße 12 a, 01234 Musterstadt", { exact: false })
    .waitFor();
  assert.equal(await page.getByText(/Bitte im Profil ergänzen/).count(), 0);
  await page
    .getByRole("button", { name: "Lieferabo anlegen", exact: true })
    .click();
  await page
    .getByLabel("Artikel suchen", { exact: true })
    .fill("Alwa Limonade Orange");
  await page.getByRole("button", { name: /Alwa Limonade Orange/ }).click();
  await page
    .getByLabel("Menge Alwa Limonade Orange", { exact: true })
    .fill("4");
  assert.equal(
    await page
      .getByRole("button", { name: "Lieferabo speichern", exact: true })
      .isEnabled(),
    true,
  );
  await page
    .getByRole("button", { name: "Lieferabo speichern", exact: true })
    .click();
  await page.getByText(/Lieferabo gespeichert\./).waitFor();
  assert.equal(commands.length, 1);
  await page
    .getByRole("button", { name: "Lieferadresse im Profil ändern" })
    .click();
  await page.getByLabel("Straße", { exact: true }).fill("Neue Straße");
  await page
    .getByRole("button", { name: "Profil speichern", exact: true })
    .click();
  await page.getByText("Gespeichert.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page
    .getByText("Neue Straße 12 a, 01234 Musterstadt", { exact: false })
    .waitFor();
  // A separate app/browser view changes profile while this page stays mounted.
  account.customer = {
    ...account.customer,
    city: "Anderer Ort",
    address: "Neue Straße 12 a, 01234 Anderer Ort",
  };
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page
    .getByText("Neue Straße 12 a, 01234 Anderer Ort", { exact: false })
    .waitFor();
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: "output/registration-address/subscription-ipad.png",
    fullPage: true,
  });
  account.customer.phone = "";
  await page.getByRole("button", { name: "Lieferabos", exact: true }).click();
  await page.getByText(/Bitte im Profil ergänzen: Telefonnummer\./).waitFor();
  assert.equal(
    await page.getByText(/Bitte im Profil ergänzen:.*Straße/).count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: full signup contact transmitted, address immediately available for subscription, subscription saved without re-entry, profile editing and stale-tab refresh, accurate phone-only notice, iPhone/iPad layout, no JS errors. Isolated APIs; no real emails or orders.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
