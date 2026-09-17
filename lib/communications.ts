import "server-only";
import { createHash } from "node:crypto";
import { serviceDb, requireStaff } from "./server";
import { signedCustomer } from "./customer-server";
import { isSystemAccountEmail } from "./account-visibility";
import type { Communication } from "./communication-types";

export async function communicationCustomer(req: Request) {
  const customerId = new URL(req.url).searchParams.get("customer");
  if (!customerId) return (await signedCustomer()).id as string;
  await requireStaff("kunden");
  if (!/^[0-9a-f-]{36}$/i.test(customerId)) throw new Error("FORBIDDEN");
  const { data, error } = await serviceDb()
    .from("customers")
    .select("id,email")
    .eq("id", customerId)
    .single();
  if (error || !data || isSystemAccountEmail(data.email))
    throw new Error("FORBIDDEN");
  return data.id as string;
}
export async function listCommunications(customerId: string, page: number) {
  const { data, error } = await serviceDb()
    .from("customer_communications")
    .select(
      "id,kind,recipient,sender,subject,body,status,error,created_at,sent_at,legacy,attachments:communication_attachments(id,filename,size_bytes,sha256)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 30, page * 30 + 30);
  if (error) throw error;
  return {
    messages: data.slice(0, 30) as Communication[],
    hasMore: data.length > 30,
  };
}
export async function archiveAttachment(
  communicationId: string,
  filename: string,
  bytes: Uint8Array,
) {
  const db = serviceDb();
  const stored = await db
    .from("communication_attachments")
    .select("*")
    .eq("communication_id", communicationId)
    .eq("filename", filename)
    .maybeSingle();
  if (stored.error) throw stored.error;
  if (stored.data) return attachmentContent(stored.data);
  const buf = Buffer.from(bytes);
  const { data, error } = await db
    .from("communication_attachments")
    .insert({
      communication_id: communicationId,
      filename,
      content_type: "application/pdf",
      content_base64: buf.toString("base64"),
      size_bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
    })
    .select("*")
    .single();
  if (error) throw error;
  return attachmentContent(data);
}
export function attachmentContent(record: {
  filename: string;
  content_base64: string;
  sha256: string;
  size_bytes: number;
}) {
  const content = Buffer.from(record.content_base64, "base64");
  if (
    content.length !== record.size_bytes ||
    createHash("sha256").update(content).digest("hex") !== record.sha256
  )
    throw new Error("Attachment integrity error");
  return { filename: record.filename, content, contentType: "application/pdf" };
}
