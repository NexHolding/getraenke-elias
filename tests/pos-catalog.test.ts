import test from "node:test";
import assert from "node:assert/strict";
import raw from "../data/catalog.json";
import type { Product } from "../lib/types";
import {
  catalogBrands,
  catalogCategories,
  productBrand,
  searchProducts,
} from "../lib/pos-catalog";
const products = raw as Product[];
test("category → brand keeps Alwa variants and pack IDs distinct", () => {
  assert.ok(catalogCategories(products).includes("Mineralwasser"));
  const brands = catalogBrands(products, "Mineralwasser");
  assert.equal(brands.filter((b) => b.startsWith("Alwa")).length, 1);
  const alwa = products.filter(
    (p) =>
      p.active && p.category === "Mineralwasser" && productBrand(p) === "Alwa",
  );
  for (const v of ["Classic", "Medium", "Still"])
    assert.ok(
      alwa.some((p) => p.variant === v),
      v,
    );
  assert.equal(new Set(alwa.map((p) => p.id)).size, alwa.length);
});
test("imported collections do not hide the actual beverage brand", () => {
  for (const p of products.filter((p) => /^Fanta\b/.test(p.name)))
    assert.equal(productBrand(p), "Fanta");
  for (const p of products.filter((p) => /^Sprite\b/.test(p.name)))
    assert.equal(productBrand(p), "Sprite");
  for (const p of products.filter((p) => /^(Aqua Römer|Römer)\b/.test(p.name)))
    assert.equal(productBrand(p), "Aqua Römer");
  assert.ok(!catalogBrands(products, "Bier").includes("Importbier"));
});
test("barcode/SKU and multi-term search exclude inactive stock", () => {
  const p = { ...products[0], barcode: "4000123456789" };
  const all = [p, { ...p, id: "inactive", active: false }];
  assert.deepEqual(
    searchProducts(all, p.barcode).map((p) => p.id),
    [p.id],
  );
  assert.deepEqual(
    searchProducts(all, p.sku).map((p) => p.id),
    [p.id],
  );
  assert.ok(
    searchProducts(products, "alwa").every((p) => productBrand(p) === "Alwa"),
  );
  const alwa = searchProducts(products, "alwa medium");
  assert.ok(alwa.length > 0);
  assert.ok(
    alwa.every((p) => productBrand(p) === "Alwa" && /medium/i.test(p.name)),
  );
  assert.equal(searchProducts(products, "no-such-product").length, 0);
});
