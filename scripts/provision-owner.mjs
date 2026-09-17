import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const env = await readFile(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const email = "info@getraenke-elias.de";
const { data, error } = await db.auth.admin.listUsers();
if (error) throw error;
let user = data.users.find((u) => u.email === email);
if (!user) {
  const password = randomBytes(24).toString("base64url");
  const r = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Frank Elias" },
  });
  if (r.error) throw r.error;
  user = r.data.user;
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/CRM-Zugang.txt",
    `Getränke Elias – privater Erstzugang\n\nAdresse: https://getraenke-elias.vercel.app/login\nE-Mail: ${email}\nTemporäres Passwort: ${password}\n\nNach Anmeldung unter /passwort ein eigenes Passwort setzen. Diese Datei nicht teilen oder in Git einchecken. Es wurde keine E-Mail verschickt.\n`,
    { mode: 0o600 },
  );
  console.log(
    "Owner account created; initial credentials saved locally, not printed.",
  );
} else {
  console.log("Existing owner identity retained; no password reset.");
}
const { error: roleError } = await db
  .from("staff")
  .upsert({ user_id: user.id, role: "owner", name: "Frank Elias" });
if (roleError) throw roleError;
console.log("Owner role assigned.");
