import { communicationCustomer, attachmentContent } from "@/lib/communications";
import { safeError, serviceDb } from "@/lib/server";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const customerId = await communicationCustomer(req);
    const { id } = await params;
    const { data, error } = await serviceDb()
      .from("communication_attachments")
      .select("*,customer_communications!inner(customer_id,status)")
      .eq("id", id)
      .eq("customer_communications.customer_id", customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return new Response("Nicht gefunden", { status: 404 });
    const attachment = attachmentContent(data);
    return new Response(attachment.content, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Disposition": `inline; filename="${attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
