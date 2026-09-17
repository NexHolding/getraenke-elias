import "server-only";
import { serviceDb } from "./server";
import { decrypt } from "./secrets";
import { smtpTransport } from "./mail";
export async function dispatchAuthMail(id?: string) {
  const db = serviceDb();
  const { data: jobs, error } = await db.rpc("claim_auth_mail", {
    p_id: id || null,
  });
  if (error) throw error;
  let sentCount = 0;
  for (const job of jobs || []) {
    let transport:
      Awaited<ReturnType<typeof smtpTransport>>["transport"] | undefined;
    let sending = false;
    try {
      const { data: message, error } = await db
        .from("customer_communications")
        .select("recipient,subject")
        .eq("id", job.communication_id)
        .single();
      if (error) throw error;
      const smtp = await smtpTransport();
      transport = smtp.transport;
      if (!smtp.enabled) throw new Error("SMTP disabled");
      const { error: senderError } = await db
        .from("customer_communications")
        .update({ sender: smtp.from })
        .eq("id", job.communication_id);
      if (senderError) throw senderError;
      const body = decrypt(job.encrypted_payload);
      sending = true;
      const result = await transport.sendMail({
        from: smtp.from,
        to: message.recipient,
        subject: message.subject,
        text: body,
        messageId: `<${job.communication_id}@getraenke-elias.de>`,
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error("SMTP did not accept recipient");
      const { error: saveError } = await db
        .from("customer_communications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: result.messageId,
        })
        .eq("id", job.communication_id);
      if (saveError) throw saveError;
      sentCount++;
    } catch {
      await db
        .from("customer_communications")
        .update({
          status: sending ? "uncertain" : "failed",
          error: sending
            ? "Versand nicht eindeutig bestätigt. Vor erneutem Versand prüfen."
            : "E-Mail-Dienst nicht verfügbar. Bitte einen neuen Link anfordern.",
        })
        .eq("id", job.communication_id);
    } finally {
      transport?.close();
      // Only erase the queued secret after a terminal status was persisted.
      // Otherwise the next worker can still mark the interrupted attempt uncertain.
      const { data: archived } = await db
        .from("customer_communications")
        .select("status")
        .eq("id", job.communication_id)
        .maybeSingle();
      if (
        archived &&
        ["sent", "failed", "uncertain"].includes(archived.status)
      ) {
        await db
          .from("auth_mail_dispatch")
          .delete()
          .eq("communication_id", job.communication_id);
      }
    }
  }
  return { sent: sentCount };
}
