import { z } from "zod";
import { discountReasons } from "./discounts";

export const saleItemSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
  discount_percent: z.number().int().min(0).max(100).default(0),
  discount_reason: z.enum(["", ...discountReasons]).default(""),
});
