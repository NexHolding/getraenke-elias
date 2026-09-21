import raw from "@/data/catalog.json";
import type { Product } from "./types";
export const initialProducts = raw as Product[];
export const categories = [
  "Alle Getränke",
  "Mineralwasser",
  "Limonade",
  "Bier",
  "Saft",
  "Wein",
  "Sekt",
  "Für Ihre Feier",
  "Non-Food",
];
