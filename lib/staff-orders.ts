import { z } from "zod";
export const deliveryIntervals = {
  weekly: "Wöchentlich",
  biweekly: "Alle 2 Wochen",
  monthly: "Monatlich",
  quarterly: "Alle 3 Monate",
  halfyearly: "Halbjährlich",
  yearly: "Jährlich",
} as const;
export const deliveryIntervalSchema = z.enum(
  Object.keys(deliveryIntervals) as [
    keyof typeof deliveryIntervals,
    ...(keyof typeof deliveryIntervals)[],
  ],
);
const items = z
  .array(
    z.object({
      id: z.string().min(1).max(80),
      quantity: z.number().int().min(1).max(100),
    }),
  )
  .min(1)
  .max(200)
  .refine(
    (items) => new Set(items.map((i) => i.id)).size === items.length,
    "Artikel dürfen nicht doppelt vorkommen.",
  );
export const staffOrderSchema = z.object({
  request_id: z.uuid(),
  customer_id: z.uuid(),
  items,
  delivery_date: z.iso.date(),
  interval: deliveryIntervalSchema.nullable(),
  notes: z.string().max(1000).default(""),
});
export const staffSubscriptionSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().min(0),
  items,
  interval: deliveryIntervalSchema,
  next_date: z.iso.date(),
  active: z.boolean(),
  notes: z.string().max(1000).default(""),
});
export const berlinToday = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
