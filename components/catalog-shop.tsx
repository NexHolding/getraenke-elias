"use client";
import { useState, useEffect } from "react";
import { Plus, Search, ArrowDownToLine } from "lucide-react";
import { categories, initialProducts } from "@/lib/catalog";
import { euro, pack } from "@/lib/money";
import type { Product } from "@/lib/types";
import { useShop } from "./site-shell";
import { ProductPhoto } from "./product-photo";
function ProductCard({ products }: { products: Product[] }) {
  const [choice, setChoice] = useState("");
  const { add } = useShop();
  const p = products.find((x) => x.id === choice) || products[0];
  return (
    <article className="product-card">
      <div
        className={`product-visual ${p.category === "Bier" ? "beer" : p.category === "Mineralwasser" ? "water" : "soda"}`}
      >
        <span>{p.category}</span>
        <ProductPhoto product={p} />
        <small>{pack(p)}</small>
      </div>
      <div className="product-info">
        <small>
          {products.length > 1
            ? `${products.length} Sorten zur Auswahl`
            : p.sku}
        </small>
        <h3>{p.group_name || p.name}</h3>
        <p>
          {pack(p)}
          {p.volume_ml > 0 &&
            ` · ${euro(Math.round(p.price_cents / ((p.pack_count * p.volume_ml) / 1000)))}/l`}
        </p>
        {products.length > 1 && (
          <label className="variant-select">
            Sorte auswählen
            <select
              aria-label={`Sorte ${p.group_name}`}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {products.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.variant || v.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="product-price">
          <div>
            <strong>{euro(p.price_cents)}</strong>
            <small>inkl. {p.tax_rate} % MwSt.</small>
            <small>
              {p.deposit_cents
                ? `zzgl. ${euro(p.deposit_cents)} Pfand`
                : "pfandfrei"}
            </small>
          </div>
          <button
            disabled={products.length > 1 && !choice}
            aria-label={`${p.name} zur Auswahl hinzufügen`}
            onClick={() => add(p)}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </article>
  );
}
export default function CatalogShop({
  initialCategory = "Alle Getränke",
}: {
  initialCategory?: string;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (d.products) setProducts(d.products);
      })
      .catch(() => {});
  }, []);
  const filtered = products.filter(
    (p) =>
      p.active &&
      (category === "Alle Getränke" || p.category === category) &&
      `${p.name} ${p.group_name} ${p.variant} ${p.sku}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const groups = Object.values(
    filtered.reduce<Record<string, Product[]>>((a, p) => {
      const key = p.group_name
        ? `${p.group_name}-${p.pack_count}-${p.volume_ml}`
        : p.id;
      (a[key] ??= []).push(p);
      return a;
    }, {}),
  ).sort((a, b) =>
    sort === "price"
      ? a[0].price_cents - b[0].price_cents
      : (a[0].group_name || a[0].name).localeCompare(
          b[0].group_name || b[0].name,
          "de",
        ),
  );
  return (
    <>
      <div className="catalog-toolbar">
        <label className="search-field">
          <Search size={20} />
          <input
            aria-label="Getränke suchen"
            placeholder="Dein Lieblingsgetränk suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Sortierung"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name A–Z</option>
          <option value="price">Preis aufsteigend</option>
        </select>
        <a
          href="/elias-lieferliste-original.pdf"
          target="_blank"
          className="text-link"
        >
          <ArrowDownToLine size={17} />
          Original-Lieferliste
        </a>
      </div>
      <div
        className="category-tabs"
        role="group"
        aria-label="Getränkekategorien"
      >
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={category === c ? "selected" : ""}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="catalog-count">
        <span>
          {groups.length} Getränke · {filtered.length} Sorten und Gebinde
        </span>
        <span>Lieferpreise inkl. MwSt. · Pfand separat ausgewiesen</span>
      </div>
      <div className="product-grid">
        {groups.map((g) => (
          <ProductCard
            key={`${g[0].group_name || g[0].id}-${g[0].pack_count}-${g[0].volume_ml}`}
            products={g}
          />
        ))}
      </div>
      {!groups.length && (
        <div className="empty">
          <Search size={35} />
          <h3>Gerade nichts gefunden.</h3>
          <button
            className="button secondary"
            onClick={() => {
              setQuery("");
              setCategory("Alle Getränke");
            }}
          >
            Filter zurücksetzen
          </button>
        </div>
      )}
      <p className="fineprint">
        Produktabbildungen zeigen die jeweilige Sorte; die bestellte Menge steht
        am Gebinde. Lieferpreise aus der Liste Februar 2026.
      </p>
    </>
  );
}
