import {
  communicationCustomer,
  listCommunications,
} from "@/lib/communications";
import { safeError } from "@/lib/server";
export async function GET(req: Request) {
  try {
    const customerId = await communicationCustomer(req);
    const page = Number(new URL(req.url).searchParams.get("page") || 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000)
      throw new Error("Invalid page");
    return Response.json(await listCommunications(customerId, page), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return safeError(e);
  }
}
