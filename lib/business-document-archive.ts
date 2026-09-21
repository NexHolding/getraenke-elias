import "server-only";
import { createHash } from "node:crypto";
import { serviceDb } from "./server";
import { businessDocument, businessDocumentFilename } from "./documents";
import { archiveAttachment, attachmentContent } from "./communications";
export async function businessDocumentArchive(
  kind: "invoice" | "delivery",
  id: string,
) {
  const db = serviceDb(),
    key = kind === "invoice" ? "invoice_id" : "delivery_id";
  const read = () =>
    db
      .from("business_documents")
      .select("filename,pdf_base64,sha256")
      .eq(key, id)
      .maybeSingle();
  let stored = await read();
  if (stored.error) throw stored.error;
  if (!stored.data) {
    const { data: record, error } = await db
      .from(kind === "invoice" ? "invoices" : "deliveries")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;
    const { data: order, error: oe } = await db
      .from("orders")
      .select("*")
      .eq("id", record.order_id)
      .single();
    if (oe) throw oe;
    const { data: cfg, error: ce } = await db
      .from("settings")
      .select("value")
      .eq("id", 1)
      .single();
    if (ce) throw ce;
    let pdf: ReturnType<typeof businessDocument> | undefined;
    const filename = businessDocumentFilename(kind, record.number);
    // If this document was mailed before PDF archiving existed, preserve that original attachment.
    const { data: mails, error: me } = await db
      .from("mail_outbox")
      .select("id")
      .eq("kind", kind + "_document")
      .eq("reference_id", id);
    if (me) throw me;
    for (const m of mails || []) {
      const { data: c, error: ce } = await db
        .from("customer_communications")
        .select("id")
        .eq("source_key", "outbox:" + m.id)
        .maybeSingle();
      if (ce) throw ce;
      if (!c) continue;
      const { data: a, error: ae } = await db
        .from("communication_attachments")
        .select("*")
        .eq("communication_id", c.id)
        .eq("filename", filename)
        .maybeSingle();
      if (ae) throw ae;
      if (a) {
        const original = attachmentContent(a);
        pdf = { filename: original.filename, bytes: original.content };
        break;
      }
    }
    if (
      !pdf &&
      kind === "invoice" &&
      !record.service_date &&
      record.delivery_id
    ) {
      const { data: delivery, error: de } = await db
        .from("deliveries")
        .select("number,delivered_at")
        .eq("id", record.delivery_id)
        .single();
      if (de) throw de;
      if (delivery.delivered_at) {
        record.service_date = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(delivery.delivered_at));
        record.delivery_number = delivery.number;
      }
    }
    pdf ??= businessDocument(kind, record, order, cfg.value);
    // Drafts remain editable and are never archived as signed delivery notes.
    if (kind === "delivery" && record.status !== "delivered") return pdf;
    const { error: ie } = await db.from("business_documents").upsert(
      {
        [key]: id,
        filename: pdf.filename,
        pdf_base64: pdf.bytes.toString("base64"),
        sha256: createHash("sha256").update(pdf.bytes).digest("hex"),
      },
      { onConflict: key, ignoreDuplicates: true },
    );
    if (ie) throw ie;
    stored = await read();
    if (stored.error) throw stored.error;
  }
  if (!stored.data) throw Error("Document archive unavailable");
  const bytes = Buffer.from(stored.data.pdf_base64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== stored.data.sha256)
    throw Error("Document integrity error");
  return { filename: stored.data.filename, bytes };
}
export async function archiveDeliveryDocuments(deliveryId: string) {
  const db = serviceDb();
  const { data: invoice, error } = await db
    .from("invoices")
    .select("id,number")
    .eq("delivery_id", deliveryId)
    .single();
  if (error) throw error;
  for (const [kind, id] of [
    ["delivery", deliveryId],
    ["invoice", invoice.id],
  ] as const) {
    const pdf = await businessDocumentArchive(kind, id);
    const { data: mails, error } = await db
      .from("mail_outbox")
      .select("id")
      .eq("kind", kind + "_document")
      .eq("reference_id", id);
    if (error) throw error;
    for (const m of mails || []) {
      const { data: c, error } = await db
        .from("customer_communications")
        .select("id")
        .eq("source_key", "outbox:" + m.id)
        .single();
      if (error) throw error;
      await archiveAttachment(c.id, pdf.filename, pdf.bytes);
    }
  }
  return invoice;
}
