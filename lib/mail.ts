import "server-only";
import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { serviceDb } from "./server";
import { decrypt } from "./secrets";
import { archiveAttachment } from "./communications";
export async function smtpTransport() {
  const { data, error } = await serviceDb()
    .from("settings")
    .select("value,smtp_secret")
    .eq("id", 1)
    .single();
  if (error || !data?.smtp_secret)
    throw new Error("E-Mail-Zugang ist nicht vollständig eingerichtet.");
  const s = data.value;
  if (!s.smtp_host || !s.smtp_user || !s.smtp_from)
    throw new Error("SMTP-Server, Benutzer und Absender fehlen.");
  const host = String(s.smtp_host);
  if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(host))
    throw new Error("Bitte einen öffentlichen SMTP-Hostnamen angeben.");
  const addresses = await lookup(host, { all: true, family: 4 });
  const address = addresses.find((a) => {
    const parts = a.address.split(".").map(Number);
    return (
      ![0, 10, 127, 169, 192, 224, 240, 255].includes(parts[0]) &&
      !(parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) &&
      !(parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    );
  });
  if (!address)
    throw new Error(
      "Private Netzwerkadressen sind als SMTP-Ziel nicht erlaubt.",
    );
  const transport = nodemailer.createTransport({
    host: address.address,
    port: s.smtp_port,
    secure: s.smtp_port === 465,
    requireTLS: true,
    tls: { servername: host, rejectUnauthorized: true },
    auth: { user: s.smtp_user, pass: decrypt(data.smtp_secret) },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return { transport, from: s.smtp_from, enabled: s.smtp_enabled };
}
export async function dispatchMail() {
  const { transport, from, enabled } = await smtpTransport();
  if (!enabled) return { sent: 0, skipped: true };
  const db = serviceDb();
  const { data: messages, error } = await db.rpc("claim_mail");
  if (error) throw error;
  let sent = 0;
  for (const m of messages || []) {
    try {
      if (m.kind === "purchase") {
        const { data: p } = await db
          .from("purchases")
          .select("status,supplier_id,source,dispatch_method")
          .eq("id", m.reference_id)
          .single();
        const { data: s } = await db
          .from("suppliers")
          .select("is_demo,auto_send,email")
          .eq("id", p?.supplier_id || "")
          .single();
        if (
          !p ||
          p.status !== "queued" ||
          !s ||
          (!(p.source === "manual" && p.dispatch_method === "email") &&
            !s.auto_send) ||
          s.email !== m.recipient
        ) {
          await db
            .from("mail_outbox")
            .update({
              status: "failed",
              error: "Lieferant oder Freigabe geändert. Kein Versand.",
            })
            .eq("id", m.id);
          continue;
        }
      }
      if (m.kind.startsWith("invoice_reminder_")) {
        const { data: invoice, error: invoiceError } = await db
          .from("invoices")
          .select("status,mode,payment_method")
          .eq("id", m.reference_id)
          .single();
        if (invoiceError) throw invoiceError;
        if (
          !invoice ||
          invoice.status !== "open" ||
          invoice.mode !== "live" ||
          invoice.payment_method !== "invoice"
        ) {
          await db
            .from("mail_outbox")
            .update({
              status: "failed",
              error:
                "Rechnung nicht mehr offen oder nicht mahnfähig. Kein Versand.",
            })
            .eq("id", m.id);
          continue;
        }
      }
      const { data: communication, error: archiveError } = await db
        .from("customer_communications")
        .select("id")
        .eq("source_key", `outbox:${m.id}`)
        .maybeSingle();
      if (archiveError) throw archiveError;
      if (communication) {
        const { error } = await db
          .from("customer_communications")
          .update({ sender: from, legacy: false })
          .eq("id", communication.id);
        if (error) throw error;
      }
      const attachments = [];
      if (
        m.kind === "delivery_document" ||
        m.kind === "invoice_document" ||
        m.kind.startsWith("invoice_reminder_")
      ) {
        const kind = m.kind === "delivery_document" ? "delivery" : "invoice";
        const { businessDocumentArchive } =
          await import("./business-document-archive");
        const pdf = await businessDocumentArchive(kind, m.reference_id);
        if (!communication) throw new Error("Customer archive unavailable");
        attachments.push(
          await archiveAttachment(communication.id, pdf.filename, pdf.bytes),
        );
      }
      if (m.kind.startsWith("invoice_reminder_")) {
        const { data: i, error } = await db
          .from("invoices")
          .select("status")
          .eq("id", m.reference_id)
          .single();
        if (error) throw error;
        if (i?.status !== "open") {
          await db
            .from("mail_outbox")
            .update({
              status: "failed",
              error: "Zahlung eingegangen – Mahnung nicht versendet.",
            })
            .eq("id", m.id);
          continue;
        }
      }
      const result = await transport.sendMail({
        attachments,
        from,
        to: m.recipient,
        subject: m.subject,
        text: m.body,
        messageId: `<${m.id}@getraenke-elias.de>`,
      });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error("SMTP did not accept recipient");
      if (communication) {
        const { error } = await db
          .from("customer_communications")
          .update({ provider_message_id: result.messageId })
          .eq("id", communication.id);
        if (error) throw error;
      }
      const { error: updateError } = await db
        .from("mail_outbox")
        .update({
          status: "sent",
          error: null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", m.id);
      if (updateError) throw updateError;
      if (m.kind === "purchase")
        await db
          .from("purchases")
          .update({ status: "sent" })
          .eq("id", m.reference_id)
          .eq("status", "queued");
      sent++;
    } catch {
      await db
        .from("mail_outbox")
        .update({
          status: "uncertain",
          error:
            "Versand nicht eindeutig bestätigt. Vor erneutem Versand Postausgang prüfen.",
        })
        .eq("id", m.id);
    }
  }
  transport.close();
  return { sent };
}
