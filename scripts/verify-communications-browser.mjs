// Authorized QA: temporary accounts only; no outgoing emails or business orders.
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { randomBytes, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { jsPDF } from "jspdf";
import assert from "node:assert/strict";
process.loadEnvFile(".env.local");
const base = process.env.QA_BASE || "http://localhost:3017";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const email =
  "qa-communication-" + randomBytes(6).toString("hex") + "@example.test";
const password = "QA-" + randomBytes(20).toString("hex");
const users = [],
  customers = [],
  messages = [];
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("output/communication", { recursive: true });
let ownerAuth;
try {
  const { data: signup, error } = await db.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { name: "QA Kommunikationsprüfung" } },
  });
  assert.ifError(error);
  users.push(signup.user.id);
  assert.equal(!!signup.user.email_confirmed_at, false);
  const denied = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  ).auth.signInWithPassword({ email, password });
  assert.ok(denied.error, "Unconfirmed user must not sign in");
  const authMessage = await db
    .from("customer_communications")
    .insert({
      source_key: "qa:" + crypto.randomUUID(),
      auth_user_id: signup.user.id,
      recipient: email,
      kind: "auth_signup",
      subject: "Bestätige dein Elias-Kundenkonto",
      body: "Dein persönlicher Sicherheitslink ist nur in der E-Mail verfügbar.",
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.ifError(authMessage.error);
  messages.push(authMessage.data.id);
  const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await ctx.newPage(),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const confirmation =
    base +
    "/auth/bestaetigen?" +
    new URLSearchParams({
      type: "signup",
      token_hash: signup.properties.hashed_token,
    });
  await p.goto(confirmation);
  assert.equal(
    !!(await db.auth.admin.getUserById(signup.user.id)).data.user
      .email_confirmed_at,
    false,
    "GET must not consume email link",
  );
  await p
    .getByRole("button", { name: "E-Mail bestätigen", exact: true })
    .click();
  await p.waitForURL("**/konto?*");
  assert.ok(p.url().endsWith("/konto?bestaetigt=1"), p.url());
  const accountResponse = await ctx.request.get(base + "/api/customer");
  assert.equal(accountResponse.status(), 200, await accountResponse.text());
  await p
    .getByRole("button", { name: "Kommunikation", exact: true })
    .waitFor({ timeout: 10000 })
    .catch(async (error) => {
      await p.screenshot({
        path: "output/communication/diagnostic.png",
        fullPage: true,
      });
      console.log(
        "Browser state",
        await p.locator("body").innerText(),
        "JavaScript errors",
        errors,
      );
      throw error;
    });
  const account = await (await ctx.request.get(base + "/api/customer")).json();
  customers.push(account.customer.id);
  assert.equal(account.customer.email, email);
  assert.equal(
    (
      await db
        .from("customer_communications")
        .select("customer_id")
        .eq("id", authMessage.data.id)
        .single()
    ).data.customer_id,
    account.customer.id,
  );
  const pdf = new jsPDF();
  pdf.text("QA Kommunikationsanhang - keine Rechnung", 20, 20);
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const invoice = await db
    .from("customer_communications")
    .insert({
      source_key: "qa:" + crypto.randomUUID(),
      customer_id: account.customer.id,
      recipient: email,
      sender: "info@getraenke-elias.de",
      kind: "invoice_document",
      subject: "QA Rechnung mit archiviertem Anhang",
      body: "Dies ist eine isolierte Funktionsprüfung. Es wurde keine E-Mail versendet.",
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  assert.ifError(invoice.error);
  messages.push(invoice.data.id);
  const attached = await db
    .from("communication_attachments")
    .insert({
      communication_id: invoice.data.id,
      filename: "QA-Anhang.pdf",
      content_type: "application/pdf",
      size_bytes: bytes.length,
      content_base64: bytes.toString("base64"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .select("id")
    .single();
  assert.ifError(attached.error);
  await p.getByRole("button", { name: "Kommunikation", exact: true }).click();
  await p
    .getByText("QA Rechnung mit archiviertem Anhang", { exact: true })
    .click();
  await p.getByRole("link", { name: /QA-Anhang.pdf/ }).waitFor();
  const received = await ctx.request.get(
    base + "/api/communications/attachments/" + attached.data.id,
  );
  assert.equal(received.status(), 200);
  assert.equal(
    createHash("sha256")
      .update(await received.body())
      .digest("hex"),
    createHash("sha256").update(bytes).digest("hex"),
  );
  await p.screenshot({
    path:
      "output/communication/" +
      (base.startsWith("https") ? "live" : "local") +
      "-customer.png",
    fullPage: true,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({
    path: "output/communication/mobile.png",
    fullPage: true,
  });
  const other = await db.auth.admin.createUser({
    email: "qa-other-" + randomBytes(6).toString("hex") + "@example.test",
    password,
    email_confirm: true,
  });
  assert.ifError(other.error);
  users.push(other.data.user.id);
  const otherC = await db
    .from("customers")
    .insert({
      user_id: other.data.user.id,
      name: "QA Zweites Konto",
      email: other.data.user.email,
    })
    .select("id")
    .single();
  assert.ifError(otherC.error);
  customers.push(otherC.data.id);
  let jar = [];
  const otherAuth = createServerClient(
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
      await otherAuth.auth.signInWithPassword({
        email: other.data.user.email,
        password,
      })
    ).error,
  );
  const headers = { Cookie: jar.map((c) => c.name + "=" + c.value).join("; ") };
  assert.equal(
    (
      await fetch(
        base + "/api/communications/attachments/" + attached.data.id,
        { headers },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(
        base + "/api/communications?customer=" + account.customer.id,
        { headers },
      )
    ).status,
    403,
  );
  await otherAuth.auth.signOut({ scope: "local" });
  const anon = await browser.newContext();
  assert.equal(
    (await anon.request.get(base + "/api/communications")).status(),
    401,
  );
  assert.equal(
    (
      await anon.request.get(
        base + "/api/communications/attachments/" + attached.data.id,
      )
    ).status(),
    401,
  );
  const accountant = JSON.parse(
    await readFile(".local/accountant-credentials.json", "utf8"),
  );
  jar = [];
  const advisor = createServerClient(
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
      await advisor.auth.signInWithPassword({
        email: accountant.email,
        password: accountant.password,
      })
    ).error,
  );
  assert.equal(
    (
      await fetch(
        base + "/api/communications?customer=" + account.customer.id,
        {
          headers: {
            Cookie: jar.map((c) => c.name + "=" + c.value).join("; "),
          },
        },
      )
    ).status,
    403,
  );
  await advisor.auth.signOut({ scope: "local" });
  const { data: ownerLink, error: ownerError } =
    await db.auth.admin.generateLink({
      type: "magiclink",
      email: "info@getraenke-elias.de",
    });
  assert.ifError(ownerError);
  jar = [];
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
        token_hash: ownerLink.properties.hashed_token,
      })
    ).error,
  );
  const ownerCtx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await ownerCtx.addCookies(
    jar.map((c) => ({ name: c.name, value: c.value, url: base })),
  );
  const op = await ownerCtx.newPage();
  await op.goto(base + "/crm/kunden");
  await op.getByRole("button").filter({ hasText: email }).click();
  await op.getByRole("button", { name: "Kommunikation", exact: true }).click();
  await op
    .getByText("QA Rechnung mit archiviertem Anhang", { exact: true })
    .click();
  await op.getByRole("link", { name: /QA-Anhang.pdf/ }).waitFor();
  assert.equal(
    (
      await ownerCtx.request.get(
        base +
          "/api/communications/attachments/" +
          attached.data.id +
          "?customer=" +
          account.customer.id,
      )
    ).status(),
    200,
  );
  await op.screenshot({
    path:
      "output/communication/" +
      (base.startsWith("https") ? "live" : "local") +
      "-crm.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "Abmelden", exact: true }).click();
  await p
    .getByRole("link", { name: "Passwort vergessen?", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Passwort vergessen?", exact: true })
    .waitFor();
  const { data: recovery, error: recoveryError } =
    await db.auth.admin.generateLink({ type: "recovery", email });
  assert.ifError(recoveryError);
  const recoveryUrl =
    base +
    "/auth/bestaetigen?" +
    new URLSearchParams({
      type: "recovery",
      token_hash: recovery.properties.hashed_token,
    });
  await p.goto(recoveryUrl);
  await p.getByRole("button", { name: "Link bestätigen", exact: true }).click();
  await p.waitForURL("**/passwort?bestaetigt=1");
  const newPassword = "QA-new-" + randomBytes(20).toString("hex");
  await p
    .getByLabel("Neues Passwort (mindestens 12 Zeichen)", { exact: true })
    .fill(newPassword);
  await p.getByLabel("Passwort wiederholen", { exact: true }).fill(newPassword);
  await p
    .getByRole("button", { name: "Passwort speichern", exact: true })
    .click();
  await p.getByText("Dein Passwort wurde geändert.", { exact: true }).waitFor();
  const check = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  assert.ok((await check.auth.signInWithPassword({ email, password })).error);
  assert.ifError(
    (await check.auth.signInWithPassword({ email, password: newPassword }))
      .error,
  );
  await check.auth.signOut({ scope: "local" });
  const reuse = await anon.newPage();
  await reuse.goto(recoveryUrl);
  await reuse
    .getByRole("button", { name: "Link bestätigen", exact: true })
    .click();
  await reuse.waitForURL("**/konto?error=confirmation");
  await reuse
    .getByText(/Der Bestätigungslink ist ungültig oder abgelaufen/)
    .waitFor();
  assert.equal(
    (
      await anon.request.post(base + "/api/hooks/auth-email", { data: {} })
    ).status(),
    401,
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "output/communication/verification.json",
    JSON.stringify(
      {
        base,
        confirmed_registration: true,
        link_scanner_safe: true,
        recovery_password_changed: true,
        one_time_token: true,
        communication_customer_and_crm: true,
        attachment_hash_identical: true,
        cross_customer_denied: true,
        accountant_denied: true,
        anonymous_denied: true,
        mobile_no_overflow: true,
        no_external_email_sent: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: actual Supabase confirmation + recovery, one-use links, immutable PDF hash, customer/CRM history, cross-customer and accountant denial, anonymous protection, mobile layout. No outgoing mail sent.",
  );
} finally {
  await ownerAuth?.auth.signOut({ scope: "local" });
  await browser.close();
  if (messages.length)
    await db.from("customer_communications").delete().in("id", messages);
  if (customers.length) await db.from("customers").delete().in("id", customers);
  await db.from("customers").delete().eq("email", email);
  for (const id of users) await db.auth.admin.deleteUser(id);
  console.log("Temporary QA accounts and correspondence removed.");
}
