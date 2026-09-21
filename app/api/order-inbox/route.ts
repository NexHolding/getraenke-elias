import { z } from "zod";
import { requireStaff, serviceDb, sameOrigin, safeError } from "@/lib/server";
import { can } from "@/lib/permissions";
import { processOrderAutomation } from "@/lib/order-automation";
async function access() {
  const staff = await requireStaff();
  if (!can(staff, "bestellungen") && !can(staff, "lieferung"))
    throw new Error("FORBIDDEN");
  return staff;
}
async function inbox(actor: string) {
  const { data, error } = await serviceDb().rpc("read_order_inbox", {
    p_actor: actor,
  });
  if (error) throw error;
  return data;
}
export async function GET() {
  try {
    const a = await access();
    return Response.json(await inbox(a.user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await access();
    const value = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("refresh") }),
        z.object({ action: z.literal("seen"), id: z.uuid() }),
      ])
      .parse(await req.json());
    if (value.action === "seen") {
      const { error } = await serviceDb().rpc("acknowledge_order_inbox", {
        p_order: value.id,
        p_actor: a.user.id,
      });
      if (error) throw error;
    } else await processOrderAutomation();
    return Response.json(await inbox(a.user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return safeError(e);
  }
}
