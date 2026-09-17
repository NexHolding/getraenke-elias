import { z } from "zod";
import {
  deliveryAddressShape,
  formatDeliveryAddress,
} from "./delivery-address";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const customerSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().min(2).max(150),
    email: z.email().transform((s) => s.toLowerCase()),
    phone: z.string().max(80).default(""),
    ...deliveryAddressShape,
    notes: z.string().max(1000).default(""),
    invoice_email: z.boolean().default(true),
    dropoff_allowed: z.boolean().default(false),
    dropoff_note: z.string().max(500).default(""),
    windows: z
      .array(
        z
          .object({ day: z.number().int().min(1).max(7), from: time, to: time })
          .refine((w) => w.from < w.to),
      )
      .max(21)
      .default([]),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
  })
  .transform((value) => ({ ...value, address: formatDeliveryAddress(value) }));
export const employeeSchema = z.object({
  finance_readonly: z.boolean().default(false),
  user_id: z.uuid().optional(),
  name: z.string().min(2).max(150),
  email: z.union([z.email(), z.literal("")]),
  phone: z.string().max(80).default(""),
  address: z.string().max(500).default(""),
  notes: z.string().max(1000).default(""),
  permissions: z
    .array(
      z.enum([
        "uebersicht",
        "finanzen",
        "kasse",
        "artikel",
        "inventur",
        "bestandskorrektur",
        "bestellungen",
        "kunden",
        "lieferung",
        "einkauf",
        "lieferanten",
        "einstellungen",
        "rabatt",
      ]),
    )
    .max(13),
  active: z.boolean(),
  pin: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  password: z.string().min(10).max(100).optional(),
});
export const subscriptionSchema = z.object({
  id: z.uuid().optional(),
  items: z
    .array(
      z.object({
        id: z.string().max(80),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(200),
  interval: z.enum([
    "weekly",
    "biweekly",
    "monthly",
    "quarterly",
    "halfyearly",
    "yearly",
  ]),
  next_date: z.iso.date(),
  active: z.boolean(),
});
