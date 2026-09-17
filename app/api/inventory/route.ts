import { z } from "zod";
import { requireStaff, serviceDb, safeError, sameOrigin } from "@/lib/server";
import { readAllRows } from "@/lib/database-read";
import {
  inventoryRequest,
  InventoryRun,
  InventoryLine,
  StockAdjustment,
  InventoryEvent,
} from "@/lib/inventory";
import type { Product } from "@/lib/types";
export async function GET(req: Request) {
  try {
    const a = await requireStaff("inventur");
    const id = new URL(req.url).searchParams.get("id");
    if (id) z.uuid().parse(id);
    const [runs, products, adjustments, lines, events] = await Promise.all([
      readAllRows<InventoryRun>("inventory_runs", {
        order: "created_at",
        ascending: false,
      }),
      readAllRows<Product>("products", { order: "name" }),
      readAllRows<StockAdjustment>("stock_adjustments", {
        order: "created_at",
        ascending: false,
      }),
      id ? readAllRows<InventoryLine>("inventory_lines", { runId: id }) : [],
      id
        ? readAllRows<InventoryEvent>("inventory_events", {
            runId: id,
            order: "created_at",
          })
        : [],
    ]);
    return Response.json(
      {
        runs,
        products,
        adjustments,
        lines,
        events,
        owner: a.role === "owner",
        canAdjust:
          a.role === "owner" || a.permissions.includes("bestandskorrektur"),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await requireStaff("inventur");
    const b = inventoryRequest.parse(await req.json());
    if (
      ["apply", "reopen", "cancel", "reverse"].includes(b.action) &&
      a.role !== "owner"
    )
      throw new Error("FORBIDDEN");
    const { data, error } = await serviceDb().rpc("inventory_command", {
      p_action: b.action,
      p_value: b.value,
      p_actor: a.user.id,
    });
    if (error)
      throw new Error(
        error.message.startsWith("HINWEIS:") || error.message === "FORBIDDEN"
          ? error.message
          : "HINWEIS:Inventur konnte nicht gespeichert werden. Bitte Eingaben und aktuellen Stand prüfen.",
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return safeError(e);
  }
}
