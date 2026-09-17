import "server-only";
import { createHash } from "node:crypto";
import { serviceDb } from "./server";
import { createReceiptPdf } from "./receipt";
import type { Sale } from "./types";

export async function receiptArchive(sale: Sale) {
  const db = serviceDb();
  const read = () =>
    db
      .from("receipt_documents")
      .select("pdf_base64,sha256,created_at")
      .eq("sale_id", sale.id)
      .maybeSingle();
  const existing = await read();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;
  const pdf = await createReceiptPdf(sale);
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const { error } = await db
    .from("receipt_documents")
    .upsert(
      {
        sale_id: sale.id,
        pdf_base64: bytes.toString("base64"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      { onConflict: "sale_id", ignoreDuplicates: true },
    );
  if (error) throw error;
  const stored = await read();
  if (stored.error || !stored.data)
    throw new Error("Receipt archive unavailable");
  return stored.data;
}
export function archivedPdf(
  doc: { pdf_base64: string; sha256: string },
  filename: string,
) {
  const bytes = Buffer.from(doc.pdf_base64, "base64");
  if (createHash("sha256").update(bytes).digest("hex") !== doc.sha256)
    throw new Error("Receipt archive integrity error");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
