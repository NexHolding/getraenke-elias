import { z } from "zod";
import { businessAddress } from "./business-address";
export const taxRateSchema = z.number().int().min(0).max(100);
import {
  deliveryAddressShape,
  formatDeliveryAddress,
} from "./delivery-address";
export const productSchema = z
  .object({
    return_eligible: z.boolean().default(false),
    group_name: z.string().max(200).default(""),
    variant: z.string().max(100).default(""),
    image_url: z
      .string()
      .max(2000)
      .refine(
        (v) =>
          !v ||
          v.startsWith("/products/") ||
          v.startsWith(
            process.env.NEXT_PUBLIC_SUPABASE_URL +
              "/storage/v1/object/public/product-images/",
          ),
      )
      .default(""),
    image_source: z.string().max(2000).default(""),
    deposit_profile: z
      .enum([
        "none",
        "beer",
        "swing",
        "reusable",
        "single",
        "sixpack",
        "custom",
      ])
      .default("custom"),
    data_note: z.string().max(1000).default(""),
    revision: z.number().int().min(0).optional(),
    id: z.string().min(1).max(80),
    sku: z.string().min(1).max(80),
    name: z.string().min(1).max(200),
    category: z.enum([
      "Mineralwasser",
      "Limonade",
      "Bier",
      "Saft",
      "Wein",
      "Sekt",
      "Für Ihre Feier",
      "Non-Food",
    ]),
    pack_count: z.number().int().min(1).max(1000),
    volume_ml: z.number().int().min(0).max(100000),
    price_cents: z.number().int().min(0).max(10000000),
    source_unit_price_cents: z.number().int().nullable().default(null),
    deposit_cents: z.number().int().min(0).max(100000).nullable(),
    tax_rate: taxRateSchema,
    deposit_tax_rate: taxRateSchema,
    stock: z.number().int().min(0).max(1000000).nullable(),
    min_stock: z.number().int().min(0).max(1000000),
    target_stock: z.number().int().min(0).max(1000000),
    supplier_id: z.string().nullable(),
    reorder_enabled: z.boolean(),
    active: z.boolean(),
    verified: z.boolean(),
    barcode: z.string().max(80),
    source: z.string().max(200),
    kind: z.enum(["beverage", "rental", "nonfood"]),
  })
  .refine((p) => !p.return_eligible || p.kind === "nonfood", "14-Tage-Rücknahme ist nur für Nicht-Lebensmittel möglich.")
  .refine(
    (p) => p.target_stock >= p.min_stock,
    "Zielbestand muss mindestens dem Mindestbestand entsprechen.",
  )
  .refine(
    (p) => !p.verified || p.deposit_cents !== null,
    "Vor Freigabe muss der Pfandbetrag geprüft sein.",
  );
export const supplierSchema = z
  .object({
    id: z.string().max(80),
    name: z.string().min(1).max(150),
    email: z.union([z.email(), z.literal("")]),
    phone: z.string().max(80),
    is_demo: z.boolean().default(false),
    company: z.string().max(200).default(""),
    address: z.string().max(500).default(""),
    contact: z.string().max(200).default(""),
    notes: z.string().max(1000).default(""),
    auto_send: z.boolean(),
  })
  .refine(
    (s) => !s.auto_send || s.email !== "",
    "Automatik benötigt eine Bestell-E-Mail-Adresse.",
  );
export const orderSchema = z
  .object({
    request_id: z.uuid(),
    customer_name: z.string().min(2).max(120),
    email: z.email().max(200),
    phone: z.string().min(5).max(60),
    ...deliveryAddressShape,
    notes: z.string().max(1000).default(""),
    website: z.literal("").optional(),
    adult: z.literal("on"),
    items: z
      .array(
        z.object({
          id: z.string().max(80),
          quantity: z.number().int().min(1).max(100),
        }),
      )
      .min(1)
      .max(200),
  })
  .transform((value) => ({ ...value, address: formatDeliveryAddress(value) }));
export const settingsSchema = z.object({
  live_mode: z.boolean().default(false),
  guest_orders: z.boolean().default(true),
  reorder_days: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .default([1]),
  reorder_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("10:00"),
  reorder_weeks: z.number().int().min(1).max(12).default(1),
  reorder_anchor: z.iso.date().default("2026-09-14"),
  delivery_days: z
    .array(z.number().int().min(1).max(7))
    .min(1)
    .max(7)
    .default([1, 2, 3, 4, 5]),
  delivery_from: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("10:00"),
  delivery_to: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default("18:00"),
  delivery_stop_minutes: z.number().int().min(1).max(120).default(10),
  discount_percent: z.number().int().min(0).max(100).default(10),
  tax_number: z.string().trim().max(80).default(""),
  vat_id: z
    .string()
    .trim()
    .regex(/^(DE[0-9]{9})?$/, "Deutsche USt-IdNr.: DE und neun Ziffern.")
    .default(""),
  register_id: z.string().trim().min(1).max(60).default("ELIAS-KASSE-01"),
  default_tax_rate: taxRateSchema.default(19),
  default_deposit_tax_rate: taxRateSchema.default(19),
  business_name: z
    .string()
    .min(1)
    .max(200)
    .default("Getränkeshop Elias · Frank Elias"),
  business_street: deliveryAddressShape.street.optional(),
  business_house_number: deliveryAddressShape.house_number.optional(),
  business_postal_code: deliveryAddressShape.postal_code.optional(),
  business_city: deliveryAddressShape.city.optional(),
  business_address: z
    .string()
    .min(1)
    .max(300)
    .default("Wartbergstraße 3 · 74076 Heilbronn"),
  route_geocoding: z.boolean().default(false),
  auto_reorder: z.boolean(),
  instagram: z
    .string()
    .max(200)
    .refine(
      (s) =>
        !s || /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(s),
    ),
  domain: z
    .string()
    .max(200)
    .regex(/^[a-z0-9.-]+$/),
  printer_mode: z.enum(["browser", "epson", "star"]),
  printer_address: z.string().max(200),
  printer_model: z.string().max(100).optional(),
  printer_device_id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .optional(),
  printer_width_dots: z.union([z.literal(512), z.literal(576)]).optional(),
  tse_provider: z.enum(["", "fiskaly", "other"]),
  smtp_enabled: z.boolean().default(false),
  smtp_host: z.string().max(200),
  smtp_port: z
    .number()
    .int()
    .refine((p) => [465, 587].includes(p)),
  smtp_user: z.string().max(200),
  smtp_from: z.union([z.email(), z.literal("")]),
  smtp_password: z.string().max(500).optional(),
}).transform((v) => {
  if (v.business_street && v.business_house_number && v.business_postal_code && v.business_city)
    return {...v,business_address:businessAddress({business_street:v.business_street,business_house_number:v.business_house_number,business_postal_code:v.business_postal_code,business_city:v.business_city})};
  return v;
});
