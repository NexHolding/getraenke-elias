import { z } from "zod";
import { requireStaff, serviceDb, safeError } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import {
  inventoryReport,
  inventoryCsv,
  adjustmentReport,
} from "@/lib/inventory-documents";
import type {
  InventoryRun,
  InventoryLine,
  InventoryEvent,
  StockAdjustment,
} from "@/lib/inventory";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireStaff("inventur");
    const { id } = await ctx.params;
    z.uuid().parse(id);
    const url = new URL(req.url);
    const adjustment = url.searchParams.get("kind") === "adjustment";
    const { data, error } = await serviceDb()
      .from(adjustment ? "stock_adjustments" : "inventory_runs")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data)
      return Response.json(
        { error: "Bericht nicht gefunden." },
        { status: 404 },
      );
    let output: ArrayBuffer | string;
    const csv = !adjustment && url.searchParams.get("format") === "csv";
    if (adjustment) output = adjustmentReport(data as StockAdjustment);
    else {
      const [lines, events] = await Promise.all([
        readAllRows<InventoryLine>("inventory_lines", { runId: id }),
        readAllRows<InventoryEvent>("inventory_events", {
          runId: id,
          order: "created_at",
        }),
      ]);
      lines.sort((a, b) =>
        a.product_snapshot.name.localeCompare(b.product_snapshot.name, "de"),
      );
      output = csv
        ? inventoryCsv(data as InventoryRun, lines)
        : inventoryReport(data as InventoryRun, lines, events);
    }
    return new Response(output, {
      headers: {
        "Content-Type": csv ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="Elias-${adjustment ? "Bestandskorrektur" : "Inventur"}-${String(data.number).padStart(6, "0")}.${csv ? "csv" : "pdf"}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
