import type { Product } from "./types";

// Existing product names remain authoritative; grouping never merges sale IDs.
const brands: [RegExp, string][] = [
  [/^alwa\b/i, "Alwa"],
  [/^ensinger\b/i, "Ensinger"],
  [/^aqua\s+römer\b|^römer\b/i, "Aqua Römer"],
  [/^aqua\s+vitale\b/i, "Aqua Vitale"],
  [/^black\s+forest\b/i, "Black Forest"],
  [/^st\.\s*leonhard\b/i, "St. Leonhard"],
  [/^staatl\.?\s*fachinger\b/i, "Staatl. Fachinger"],
  [/^coca[ -]?cola\b/i, "Coca-Cola"],
  [/^fanta\b/i, "Fanta"],
  [/^sprite\b/i, "Sprite"],
  [/^mezzo\s+mix\b/i, "Mezzo Mix"],
  [/^fritz\b/i, "Fritz"],
  [/^club\s+mate\b/i, "Club Mate"],
  [/^stuttgarter\s+hofbräu\b/i, "Stuttgarter Hofbräu"],
  [/^schwaben\s+bräu\b/i, "Schwaben Bräu"],
  [/^wg\s+(heilbronn|hn)\b/i, "WG Heilbronn"],
  [/^beil\b/i, "Beil"],
];
export function productBrand(product: Product): string {
  const name = product.name.trim();
  const sixpack = /^Bier Sixpack\s+(.+)$/i.exec(name);
  if (sixpack) return sixpack[1].replace(/’/g, "'");
  const known = brands.find(([pattern]) => pattern.test(name));
  if (known) return known[1];
  // These imported collection names are not manufacturers.
  if (["Importbier", "Internationale Biere"].includes(product.group_name || ""))
    return product.variant || name;
  if (product.category === "Für Ihre Feier" || product.category === "Sekt")
    return product.group_name || name;
  return (
    product.group_name?.trim() ||
    name.split(/\s+/)[0].replace(/’/g, "'") ||
    "Weitere Artikel"
  );
}
export function catalogCategories(products: Product[]) {
  return [
    ...new Set(products.filter((p) => p.active).map((p) => p.category)),
  ].sort((a, b) => a.localeCompare(b, "de"));
}
export function catalogBrands(products: Product[], category: string) {
  return [
    ...new Set(
      products
        .filter((p) => p.active && p.category === category)
        .map(productBrand),
    ),
  ].sort((a, b) => a.localeCompare(b, "de"));
}
export function searchProducts(products: Product[], query: string) {
  const terms = query
    .trim()
    .toLocaleLowerCase("de")
    .split(/\s+/)
    .filter(Boolean);
  return products.filter((p) => {
    if (!p.active) return false;
    const words = `${p.name} ${p.variant || ""} ${productBrand(p)}`
      .toLocaleLowerCase("de")
      .split(/[^\p{L}\p{N}]+/u);
    const identifiers = `${p.sku} ${p.barcode || ""}`.toLocaleLowerCase("de");
    // Word prefixes avoid matching "Alwa" inside "Mineralwasser".
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
