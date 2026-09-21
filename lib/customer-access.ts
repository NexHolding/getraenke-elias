import "server-only";
import { randomUUID } from "node:crypto";
import { serviceDb } from "./server";
import { isSystemAccountEmail } from "./account-visibility";
import { authEmailMessages } from "./auth-email";
import { encrypt } from "./secrets";
import { dispatchAuthMail } from "./auth-mail-dispatch";
export async function requestCustomerAccess(id: string, actor: string) {
  const db = serviceDb();
  const { data: c, error } = await db
    .from("customers")
    .select("id,email,user_id,name,account_deleted_at")
    .eq("id", id)
    .single();
  if (error || !c) throw Error("HINWEIS:Kunde nicht gefunden.");
  if (c.account_deleted_at)
    throw Error(
      "HINWEIS:Dieser Online-Zugang wurde auf Kundenwunsch gelöscht. Eine erneute Registrierung erfolgt durch den Kunden selbst.",
    );
  if (isSystemAccountEmail(c.email)) throw Error("FORBIDDEN");
  const { data: cfg, error: cfgError } = await db
    .from("settings")
    .select("value,smtp_secret")
    .eq("id", 1)
    .single();
  if (
    cfgError ||
    !cfg?.value.smtp_enabled ||
    !cfg.smtp_secret ||
    !cfg.value.smtp_host ||
    !cfg.value.smtp_user ||
    !cfg.value.smtp_from
  )
    throw Error(
      "HINWEIS:Bitte zuerst den E-Mail-Ausgang unter Einstellungen → Schnittstellen einrichten. Es wurde kein Zugangslink versendet.",
    );
  const { data: allowed, error: limitError } = await db.rpc(
    "allow_customer_access",
    { p_id: id },
  );
  if (limitError || !allowed)
    throw Error(
      "HINWEIS:Bitte eine Minute bis zur nächsten Zugangsmail warten.",
    );
  const { data: statuses, error: statusError } = await db.rpc(
    "customer_login_status",
    { p_ids: [id] },
  );
  if (statusError) throw statusError;
  const status = statuses?.[0];
  const site =
    process.env.NEXT_PUBLIC_SITE_URL || "https://getraenke-elias.vercel.app";
  if (status?.user_id && !status.confirmed && status.has_password) {
    const { error } = await db.auth.resend({
      type: "signup",
      email: c.email,
      options: { emailRedirectTo: `${site}/auth/callback?next=/konto` },
    });
    if (error)
      throw Error(
        "HINWEIS:Bestätigungsmail konnte nicht angefordert werden. Bitte den E-Mail-Dienst prüfen.",
      );
    return {
      ok: true,
      message:
        "Bestätigungsmail angefordert. Der Kunde bestätigt seine E-Mail-Adresse; bei vergessenem Passwort nutzt er anschließend „Passwort vergessen“.",
    };
  }
  const type = status?.user_id ? "recovery" : "invite";
  const { data: link, error: linkError } = await db.auth.admin.generateLink({
    type,
    email: c.email,
    options: { redirectTo: `${site}/auth/callback?next=/passwort` },
  });
  if (linkError || !link?.user?.id || !link.properties?.hashed_token)
    throw Error(
      "HINWEIS:Zugangslink konnte nicht erstellt werden. Bitte den Zugang prüfen.",
    );
  if (c.user_id && c.user_id !== link.user.id) throw Error("FORBIDDEN");
  const { error: linkCustomerError } = await db
    .from("customers")
    .update({ user_id: link.user.id })
    .eq("id", id);
  if (linkCustomerError) throw linkCustomerError;
  const message = authEmailMessages(
    {
      user: { id: link.user.id, email: c.email },
      email_data: {
        email_action_type: type,
        token_hash: link.properties.hashed_token,
      },
    },
    site,
  )[0];
  const { data: mid, error: queueError } = await db.rpc("queue_auth_mail", {
    p_source: `crm-access:${randomUUID()}`,
    p_user: link.user.id,
    p_recipient: message.recipient,
    p_kind: `auth_${type}`,
    p_subject: message.subject,
    p_body: message.archiveBody,
    p_secret: encrypt(message.body),
  });
  if (queueError) throw queueError;
  await db.from("audit_log").insert({
    table_name: "customers",
    record_id: id,
    action: "access_link_requested",
    actor,
    details: { communication_id: mid, type },
  });
  const result = await dispatchAuthMail(mid);
  return {
    ok: true,
    message: result.sent
      ? "Zugangsmail an den Mailserver übergeben. Der Kunde legt sein Passwort über den persönlichen Link fest."
      : "Zugangsmail konnte nicht bestätigt werden. Bitte den Versandstatus unter Kommunikation prüfen.",
  };
}
