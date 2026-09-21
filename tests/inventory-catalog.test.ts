import { test } from "node:test";
import assert from "node:assert/strict";
import { searchInventoryProducts } from "../lib/inventory-catalog";
import type { Product } from "../lib/types";
const products = [
  {
    id: "a",
    name: "Alwa Classic",
    sku: "AW-001",
    barcode: "4001234567890",
    category: "Wasser",
    group_name: "Alwa",
    pack_count: 12,
    volume_ml: 700,
    stock: 2,
    loose_stock: 3,
    active: true,
  },
  {
    id: "b",
    name: "Alwa Naturelle",
    sku: "AW-002",
    barcode: "4001234567891",
    category: "Wasser",
    pack_count: 6,
    volume_ml: 1000,
    stock: 0,
    loose_stock: 2,
    active: false,
  },
  {
    id: "c",
    name: "Römer Mineralwasser",
    sku: "RO-003",
    barcode: "",
    category: "Wasser",
    pack_count: 12,
    volume_ml: 700,
    stock: null,
    active: true,
  },
  {
    id: "d",
    name: "Leerer Altartikel",
    sku: "OLD",
    barcode: "",
    category: "Wasser",
    pack_count: 6,
    volume_ml: 1000,
    stock: 0,
    active: false,
  },
] as Product[];
test("stock search distinguishes variants, formats, SKU and EAN and includes inactive remaining stock", () => {
  const ids = (q: string) =>
    searchInventoryProducts(products, q).map((p) => p.id);
  assert.deepEqual(ids(""), ["a", "b", "c"]);
  assert.deepEqual(ids("alwa"), ["a", "b"]);
  assert.deepEqual(ids("alwa classic 0,7"), ["a"]);
  assert.deepEqual(ids("AW-002"), ["b"]);
  assert.deepEqual(ids("4001234567890"), ["a"]);
  assert.deepEqual(ids("romer"), ["c"]);
  assert.deepEqual(ids("unbekannt"), []);
});
