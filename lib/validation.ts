import { z } from "zod";
export const productSchema = z
  .object({
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
    ]),
    pack_count: z.number().int().min(1).max(1000),
    volume_ml: z.number().int().min(0).max(100000),
    price_cents: z.number().int().min(0).max(10000000),
    source_unit_price_cents: z.number().int().nullable().default(null),
    deposit_cents: z.number().int().min(0).max(100000).nullable(),
    tax_rate: z.union([z.literal(0), z.literal(7), z.literal(19)]),
    deposit_tax_rate: z.union([z.literal(0), z.literal(7), z.literal(19)]),
    stock: z.number().int().min(0).max(1000000).nullable(),
    min_stock: z.number().int().min(0).max(1000000),
    target_stock: z.number().int().min(0).max(1000000),
    supplier_id: z.string().nullable(),
    reorder_enabled: z.boolean(),
    active: z.boolean(),
    verified: z.boolean(),
    barcode: z.string().max(80),
    source: z.string().max(200),
    kind: z.enum(["beverage", "rental"]),
  })
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
    is_demo: z.boolean(),
    auto_send: z.boolean(),
  })
  .refine(
    (s) => !s.auto_send || (!s.is_demo && s.email !== ""),
    "Automatik benötigt einen echten Lieferanten und eine Bestelladresse.",
  );
export const orderSchema = z.object({
  request_id: z.uuid(),
  customer_name: z.string().min(2).max(120),
  email: z.email().max(200),
  phone: z.string().min(5).max(60),
  address: z.string().min(8).max(300),
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
    .max(108),
});
export const settingsSchema = z.object({
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
});
