import { z } from "zod";
import { deliveryIntervalSchema } from "./staff-orders";
export const subscriptionCommandSchema = z
  .object({
    request_id: z.uuid(),
    id: z.uuid(),
    revision: z.number().int().min(0).nullable(),
    customer_id: z.uuid(),
    interval: deliveryIntervalSchema,
    next_date: z.iso.date(),
    active: z.boolean(),
    notes: z.string().trim().max(1000).default(""),
    items: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine(
    (v) => new Set(v.items.map((i) => i.id)).size === v.items.length,
    "Artikel dürfen nicht doppelt vorkommen.",
  );
export type SubscriptionCommand = z.infer<typeof subscriptionCommandSchema>;
