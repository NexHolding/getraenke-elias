import { z } from "zod";
import type { Product, Settings } from "./types";
export const inventoryReasons = {
  breakage: "Bruch / Beschädigung",
  theft: "Diebstahl / Diebstahlsverdacht",
  loss: "Verlust / Schwund",
  expiry: "Abgelaufen / verdorben",
  gift: "Verschenkte Ware",
  personal_use: "Privatentnahme",
  sample: "Verkostung / Warenprobe",
  supplier_return: "Lieferantenrückgabe",
  found: "Wiedergefunden / Mehrbestand",
  count_error: "Zähl- / Erfassungsfehler",
  other: "Sonstiger Grund",
} as const;
export const reasonLabel = (s: string) =>
  ({
    initial: "Erstbestand",
    none: "Keine Differenz",
    reversal: "Gegenbuchung",
    ...inventoryReasons,
  })[s as keyof typeof inventoryReasons] || s;
export type InventoryRun = {
  id: string;
  number: number;
  title: string;
  location: string;
  inventory_date: string;
  status: "counting" | "review" | "applied" | "cancelled";
  created_at: string;
  created_name: string;
  submitted_at: string | null;
  applied_at: string | null;
  applied_name: string | null;
  revision: number;
  notes: string;
  business_snapshot: Settings;
};
export type InventoryLine = {
  id: string;
  run_id: string;
  product_id: string;
  product_snapshot: Product;
  book_units: number | null;
  counted_units: number | null;
  stock_version: number | null;
  cost_net_cents: number | null;
  reason: string;
  note: string;
  counted_at: string | null;
  counted_name: string | null;
  apply_book_units: number | null;
  applied_units: number | null;
  movement_since_count: number | null;
  revision: number;
};
export type StockAdjustment = {
  id: string;
  number: number;
  product_id: string;
  product_snapshot: Product;
  before_units: number;
  delta_units: number;
  after_units: number;
  reason: string;
  note: string;
  reference: string;
  occurred_on: string;
  created_at: string;
  actor_name: string;
  reverses_id: string | null;
  business_snapshot: Settings;
};
export type InventoryEvent = {
  id: number;
  run_id: string;
  line_id: string | null;
  action: string;
  actor_name: string;
  created_at: string;
  before_value: unknown;
  after_value: unknown;
};
export function inventoryEventDetail(event: InventoryEvent) {
  if (event.action !== "counted") return "";
  const before = event.before_value as Partial<InventoryLine> | null;
  const after = event.after_value as Partial<InventoryLine> | null;
  const value = after?.cost_net_cents;
  return `${before?.counted_units ?? "Offen"} -> ${after?.counted_units ?? "Offen"} Einzelstücke; EK netto/Gebinde: ${value == null ? "offen" : (value / 100).toFixed(2) + " EUR"}; ${reasonLabel(after?.reason || "")}${after?.note ? "; " + after.note : ""}`;
}
export function inventoryValue(
  units: number | null,
  packCount: number,
  cost: number | null,
) {
  return units === 0
    ? 0
    : units === null || cost === null
      ? null
      : Math.sign(units) * Math.round((Math.abs(units) * cost) / packCount);
}
export function quantityLabel(units: number | null, packCount: number) {
  if (units === null) return "Unbekannt";
  const sign = units < 0 ? "−" : "";
  const n = Math.abs(units);
  return packCount === 1
    ? `${sign}${n} Stück`
    : `${sign}${Math.floor(n / packCount)} Geb. + ${n % packCount} einzeln`;
}
const uuid = z.uuid(),
  text = z.string().trim().min(2).max(150),
  reason = z.enum(
    Object.keys(inventoryReasons) as [
      keyof typeof inventoryReasons,
      ...(keyof typeof inventoryReasons)[],
    ],
  );
const version = z.number().int().min(0),
  note = z.string().trim().max(1500).default("");
export const inventoryRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    value: z.object({
      run_id: uuid,
      title: text,
      location: text,
      inventory_date: z.iso.date(),
      notes: note,
    }),
  }),
  z.object({
    action: z.literal("count"),
    value: z.object({
      run_id: uuid,
      line_id: uuid,
      revision: version,
      stock_version: version,
      packs: z.number().int().min(0).max(1000000),
      loose: z.number().int().min(0).max(999),
      cost_net_cents: z.number().int().min(0).max(100000000).nullable(),
      reason: z.union([
        reason,
        z.literal(""),
        z.literal("initial"),
        z.literal("none"),
      ]),
      note,
    }),
  }),
  z.object({
    action: z.literal("add"),
    value: z.object({
      run_id: uuid,
      id: uuid,
      product_id: z.string().min(1).max(80).optional(),
      name: text,
      category: text,
      pack_count: z.number().int().min(1).max(1000),
      volume_ml: z.number().int().min(0).max(1000000),
      barcode: z.string().max(80).default(""),
    }),
  }),
  z.object({
    action: z.enum(["submit", "reopen", "cancel", "apply"]),
    value: z.object({
      run_id: uuid,
      revision: version,
      confirmation: z.literal("BESTAND ÜBERNEHMEN").optional(),
    }),
  }),
  z.object({
    action: z.literal("adjust"),
    value: z.object({
      id: uuid,
      product_id: z.string().min(1).max(80),
      delta_units: z
        .number()
        .int()
        .min(-10000000)
        .max(10000000)
        .refine((x) => x !== 0),
      reason,
      note: z.string().trim().min(3).max(1500),
      reference: z.string().max(300).default(""),
      occurred_on: z.iso.date(),
    }),
  }),
  z.object({
    action: z.literal("reverse"),
    value: z.object({
      id: uuid,
      reverses_id: uuid,
      note: z.string().trim().min(3).max(1500),
      reference: z.string().max(300).default(""),
      occurred_on: z.iso.date(),
    }),
  }),
]);
