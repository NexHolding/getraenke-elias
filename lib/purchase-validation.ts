import { z } from "zod";
export const manualPurchaseSchema = z.object({
  request_id: z.uuid(),
  supplier_id: z.string().min(1).max(80),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        quantity: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (items) => new Set(items.map((i) => i.id)).size === items.length,
      "Artikel dürfen nicht doppelt vorkommen.",
    ),
  requested_date: z.iso.date().nullable().default(null),
  reference: z.string().trim().max(200).default(""),
  notes: z.string().trim().max(1000).default(""),
});
