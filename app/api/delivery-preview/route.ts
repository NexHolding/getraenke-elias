import { z } from "zod";
import { requireStaff, safeError } from "@/lib/server";
import { loadTourPreview } from "@/lib/tour-preview-server";
export async function GET(req: Request) {
  try {
    await requireStaff("lieferung");
    const date = z.iso.date().parse(new URL(req.url).searchParams.get("date"));
    const { preview } = await loadTourPreview(date);
    return Response.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return safeError(error);
  }
}
