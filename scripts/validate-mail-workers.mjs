// Runs the real workers against an isolated DB/SMTP adapter. No network access.
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { createCipheriv, randomBytes, createHash } from "node:crypto";
import assert from "node:assert/strict";
const tables = {
  settings: [
    {
      id: 1,
      value: {
        smtp_host: "smtp.example.test",
        smtp_port: 587,
        smtp_user: "qa",
        smtp_from: "info@example.test",
        smtp_enabled: true,
      },
      smtp_secret: "",
    },
  ],
  customer_communications: [],
  auth_mail_dispatch: [],
  mail_outbox: [],
  communication_attachments: [],
  invoices: [{ id: "invoice-1", order_id: "order-1" }],
  orders: [{ id: "order-1" }],
  purchases: [],
  suppliers: [],
};
const encryptionKey = randomBytes(32);
process.env.SETTINGS_ENCRYPTION_KEY = encryptionKey.toString("hex");
const encrypt = (value) => {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  return [
    iv.toString("hex"),
    cipher.update(value, "utf8", "hex") + cipher.final("hex"),
    cipher.getAuthTag().toString("hex"),
  ].join(":");
};
tables.settings[0].smtp_secret = encrypt("local-only-smtp-password");
const sent = [];
let fail = false;
const fake = {
  from(table) {
    let op = "read",
      value,
      filters = [];
    const run = () => {
      const rows = tables[table].filter((row) =>
        filters.every(([k, v]) => row[k] === v),
      );
      if (op === "update") {
        for (const row of rows) {
          Object.assign(row, value);
          if (table === "mail_outbox") {
            const c = tables.customer_communications.find(
              (c) => c.source_key === "outbox:" + row.id,
            );
            if (c) Object.assign(c, value);
          }
        }
      }
      if (op === "insert") {
        const r = { id: crypto.randomUUID(), ...value };
        tables[table].push(r);
        return { data: [r], error: null };
      }
      if (op === "delete")
        tables[table] = tables[table].filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    };
    const query = {
      select() {
        return query;
      },
      eq(k, v) {
        filters.push([k, v]);
        return query;
      },
      update(v) {
        op = "update";
        value = v;
        return query;
      },
      insert(v) {
        op = "insert";
        value = v;
        return query;
      },
      delete() {
        op = "delete";
        return query;
      },
      async single() {
        const r = run();
        return { ...r, data: r.data[0] };
      },
      async maybeSingle() {
        return query.single();
      },
      then(resolve, reject) {
        return Promise.resolve(run()).then(resolve, reject);
      },
    };
    return query;
  },
  async rpc(name, { p_id } = {}) {
    if (name === "claim_auth_mail") {
      const jobs = tables.auth_mail_dispatch.filter(
        (q) => !q.claimed_at && (!p_id || q.communication_id === p_id),
      );
      for (const q of jobs) {
        q.claimed_at = new Date().toISOString();
        tables.customer_communications.find(
          (c) => c.id === q.communication_id,
        ).status = "sending";
      }
      return { data: [...jobs], error: null };
    }
    if (name === "claim_mail")
      return {
        data: tables.mail_outbox.filter((m) => m.status === "pending"),
        error: null,
      };
    throw Error(name);
  },
};
globalThis.__eliasMailQA = {
  db: fake,
  transport: {
    async sendMail(message) {
      if (fail) throw Error("Simulated connection uncertainty");
      sent.push(message);
      return {
        accepted: [message.to],
        rejected: [],
        messageId: message.messageId,
      };
    },
    close() {},
  },
};
await mkdir(".local", { recursive: true });
const target = ".local/mail-worker-test.mjs";
await build({
  stdin: {
    contents:
      'export {dispatchMail} from "./lib/mail";export {dispatchAuthMail} from "./lib/auth-mail-dispatch";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  outfile: target,
  plugins: [
    {
      name: "isolated-adapters",
      setup(b) {
        b.onResolve(
          { filter: /^(server-only|nodemailer|node:dns\/promises)$/ },
          (args) => ({ path: args.path, namespace: "qa" }),
        );
        b.onResolve({ filter: /^(\.\/|@\/lib\/)?server$/ }, () => ({
          path: "server",
          namespace: "qa",
        }));
        b.onResolve({ filter: /^\.\/documents$/ }, () => ({
          path: "documents",
          namespace: "qa",
        }));
        b.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({
          loader: "js",
          contents:
            args.path === "server-only"
              ? ""
              : args.path === "server"
                ? "export const serviceDb=()=>globalThis.__eliasMailQA.db;export const userDb=()=>{};export const requireStaff=()=>{};"
                : args.path === "nodemailer"
                  ? "export default {createTransport:()=>globalThis.__eliasMailQA.transport};"
                  : args.path === "documents"
                    ? 'export const businessDocument=()=>({filename:"Elias-QA.pdf",bytes:Buffer.from("%PDF-QA-original")});'
                    : 'export const lookup=async()=>[{address:"1.1.1.1"}];',
        }));
      },
    },
  ],
});
try {
  const { dispatchAuthMail, dispatchMail } = await import("../" + target);
  const body = "Persönlicher Link https://example.test/auth?token=secret-token";
  tables.customer_communications.push({
    id: "auth-1",
    recipient: "kunde@example.test",
    subject: "Bestätigung",
    status: "pending",
  });
  tables.auth_mail_dispatch.push({
    communication_id: "auth-1",
    encrypted_payload: encrypt(body),
  });
  assert.equal((await dispatchAuthMail("auth-1")).sent, 1);
  assert.equal(sent[0].text, body);
  assert.equal(tables.customer_communications[0].status, "sent");
  assert.equal(tables.auth_mail_dispatch.length, 0);
  assert.equal((await dispatchAuthMail("auth-1")).sent, 0);
  assert.equal(sent.length, 1);
  tables.customer_communications.push({
    id: "auth-2",
    recipient: "kunde@example.test",
    subject: "Reset",
    status: "pending",
  });
  tables.auth_mail_dispatch.push({
    communication_id: "auth-2",
    encrypted_payload: encrypt(body),
  });
  fail = true;
  assert.equal((await dispatchAuthMail("auth-2")).sent, 0);
  assert.equal(tables.customer_communications[1].status, "uncertain");
  assert.equal(tables.auth_mail_dispatch.length, 0);
  fail = false;
  tables.customer_communications.push({
    id: "archive-1",
    source_key: "outbox:mail-1",
    status: "pending",
  });
  tables.mail_outbox.push({
    id: "mail-1",
    kind: "invoice_document",
    reference_id: "invoice-1",
    recipient: "kunde@example.test",
    subject: "Rechnung",
    body: "Originalnachricht",
    status: "pending",
  });
  assert.equal((await dispatchMail()).sent, 1);
  assert.equal(tables.customer_communications[2].status, "sent");
  const attachment = tables.communication_attachments[0],
    mail = sent[1];
  assert.equal(
    attachment.content_base64,
    mail.attachments[0].content.toString("base64"),
  );
  assert.equal(
    attachment.sha256,
    createHash("sha256").update(mail.attachments[0].content).digest("hex"),
  );
  assert.equal(mail.text, "Originalnachricht");
  assert.equal((await dispatchMail()).sent, 0);
  tables.suppliers.push({
    id: "supplier-qa",
    email: "supplier@example.test",
    auto_send: false,
  });
  tables.purchases.push({
    id: "purchase-manual",
    supplier_id: "supplier-qa",
    source: "manual",
    dispatch_method: "email",
    status: "queued",
  });
  tables.mail_outbox.push({
    id: "manual-mail",
    kind: "purchase",
    reference_id: "purchase-manual",
    recipient: "supplier@example.test",
    subject: "Zusatzbestellung",
    body: "100 Kisten",
    status: "pending",
  });
  assert.equal(
    (await dispatchMail()).sent,
    1,
    "Explicit manual send is independent of supplier automatic-dispatch switch",
  );
  assert.equal(tables.purchases[0].status, "sent");
  assert.equal(sent.at(-1).text, "100 Kisten");
  tables.purchases.push({
    id: "purchase-automatic",
    supplier_id: "supplier-qa",
    source: "automatic",
    dispatch_method: "email",
    status: "queued",
  });
  tables.mail_outbox.push({
    id: "automatic-mail",
    kind: "purchase",
    reference_id: "purchase-automatic",
    recipient: "supplier@example.test",
    subject: "Automatik",
    body: "7 Kisten",
    status: "pending",
  });
  assert.equal(
    (await dispatchMail()).sent,
    0,
    "Automatic dispatch still requires supplier approval",
  );
  assert.equal(tables.mail_outbox.at(-1).status, "failed");
  console.log(
    "PASS: manual supplier mail dispatches only after explicit queueing; automatic supplier permission remains required. No outgoing mail.",
  );
  console.log(
    "PASS: encrypted auth queue -> SMTP -> sent archive -> secret removal; duplicate suppression; uncertain SMTP status; archived document byte-for-byte equals transmitted attachment. Isolated adapters, no outgoing mail.",
  );
} finally {
  await rm(target, { force: true });
  delete globalThis.__eliasMailQA;
}
