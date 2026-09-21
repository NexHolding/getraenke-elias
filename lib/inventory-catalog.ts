import { pack } from "./money";
import type { Product } from "./types";

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("de")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss");

export function searchInventoryProducts(products: Product[], query: string) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    if (
      !p.active &&
      !(p.stock && p.stock > 0) &&
      !(p.loose_stock && p.loose_stock > 0)
    )
      return false;
    const words = normalize(
      `${p.name} ${p.group_name || ""} ${p.variant || ""} ${p.category} ${pack(p)}`,
    )
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const identifiers = normalize(`${p.sku} ${p.barcode || ""}`);
    return terms.every(
      (term) =>
        identifiers.includes(term) ||
        term
          .split(/[^\p{L}\p{N}]+/u)
          .filter(Boolean)
          .every((part) => words.some((word) => word.startsWith(part))),
    );
  });
}
