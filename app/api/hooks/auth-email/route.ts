import { Webhook } from "standardwebhooks";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { authEmailSchema, authEmailMessages } from "@/lib/auth-email";
import { serviceDb } from "@/lib/server";
import { encrypt } from "@/lib/secrets";
import { dispatchAuthMail } from "@/lib/auth-mail-dispatch";
export const maxDuration = 60;
export async function POST(req: Request) {
  const secret = process.env.AUTH_EMAIL_HOOK_SECRET;
  if (!secret)
    return Response.json(
      {
        error: {
          http_code: 503,
          message: "E-Mail-Dienst noch nicht eingerichtet.",
        },
      },
      { status: 503 },
    );
  if (Number(req.headers.get("content-length") || 0) > 64000)
    return new Response("Too large", { status: 413 });
  const body = await req.text();
  if (body.length > 64000) return new Response("Too large", { status: 413 });
  let payload;
  try {
    payload = authEmailSchema.parse(
      new Webhook(secret.replace(/^v1,/, "")).verify(
        body,
        Object.fromEntries(req.headers),
      ),
    );
  } catch {
    return new Response("Invalid signature or payload", { status: 401 });
  }
  const db = serviceDb();
  try {
    const { data: cfg, error } = await db
      .from("settings")
      .select("value,smtp_secret")
      .eq("id", 1)
      .single();
    if (
      error ||
      !cfg?.value.smtp_enabled ||
      !cfg.smtp_secret ||
      !cfg.value.smtp_host ||
      !cfg.value.smtp_user ||
      !cfg.value.smtp_from
    ) {
      console.error("[auth-email] Confirmation delivery unavailable", {
        reason: error ? "settings_read_failed" : "smtp_not_configured",
      });
      throw new Error("SMTP unavailable");
    }
    const messages = authEmailMessages(
      payload,
      process.env.NEXT_PUBLIC_SITE_URL || "https://getraenke-elias.vercel.app",
    );
    const ids: string[] = [];
    for (const message of messages) {
      const sourceKey =
        "auth:" +
        createHash("sha256")
          .update(req.headers.get("webhook-id")! + ":" + message.recipient)
          .digest("hex");
      const { data, error } = await db.rpc("queue_auth_mail", {
        p_source: sourceKey,
        p_user: payload.user.id,
        p_recipient: message.recipient,
        p_kind: "auth_" + payload.email_data.email_action_type,
        p_subject: message.subject,
        p_body: message.archiveBody,
        p_secret: encrypt(message.body),
      });
      if (error) throw error;
      ids.push(data);
    }
    // Respond within the auth hook deadline. A durable queue and cron cover interrupted workers.
    after(async () => {
      for (const id of ids) await dispatchAuthMail(id);
    });
    return Response.json({});
  } catch {
    return Response.json(
      {
        error: {
          http_code: 503,
          message:
            "E-Mail konnte nicht angefordert werden. Bitte später erneut versuchen.",
        },
      },
      { status: 503 },
    );
  }
}
