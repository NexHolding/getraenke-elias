import { serviceDb } from "@/lib/server";
import { archivedPdf } from "@/lib/receipt-archive";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const notFound = () =>
    new Response("Beleg nicht verfügbar oder Link abgelaufen.", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  try {
    const { token } = await params;
    if (!/^[a-f0-9]{64}$/.test(token)) return notFound();
    const db = serviceDb();
    const { data: w } = await db
      .from("receipt_workflows")
      .select("sale_id")
      .eq("public_token", token)
      .not("consent_at", "is", null)
      .gt("share_expires_at", new Date().toISOString())
      .maybeSingle();
    if (!w) return notFound();
    const { data: doc } = await db
      .from("receipt_documents")
      .select("pdf_base64,sha256")
      .eq("sale_id", w.sale_id)
      .maybeSingle();
    if (!doc) return notFound();
    return archivedPdf(doc, "Elias-Bon.pdf");
  } catch {
    return notFound();
  }
}
