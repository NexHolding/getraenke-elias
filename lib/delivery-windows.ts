import { z } from "zod";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const deliveryWindowsSchema = z
  .array(
    z
      .object({
        day: z.number().int().min(1).max(7),
        from: time,
        to: time,
      })
      .refine(
        (w) => w.from < w.to,
        "Die Endzeit muss nach der Startzeit liegen.",
      ),
  )
  .min(1)
  .max(21);
export type DeliveryWindow = z.infer<typeof deliveryWindowsSchema>[number];
export const weekdays = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];
