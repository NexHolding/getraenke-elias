"use client";
import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Droplets,
  Beer,
  Wine,
  GlassWater,
  ArrowDownToLine,
  SlidersHorizontal,
} from "lucide-react";
import { categories, initialProducts } from "@/lib/catalog";
import { euro, pack } from "@/lib/money";
import { useShop } from "./site-shell";
export default function CatalogShop({
  initialCategory = "Alle Getränke",
}: {
  initialCategory?: string;
}) {
  const [products, setProducts] = useState(initialProducts),
    [category, setCategory] = useState(initialCategory),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("name");
  const { add } = useShop();
  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (d.products) setProducts(d.products);
      })
      .catch(() => {});
  }, []);
  const shown = products
    .filter(
      (p) =>
        p.active &&
        (category === "Alle Getränke" || p.category === category) &&
        `${p.name} ${p.sku}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "price"
        ? a.price_cents - b.price_cents
        : a.name.localeCompare(b.name, "de"),
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
        <label className="sort-field">
          <SlidersHorizontal size={17} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sortierung"
          >
            <option value="name">Name A–Z</option>
            <option value="price">Preis aufsteigend</option>
          </select>
        </label>
        <a
          href="/elias-lieferliste-original.pdf"
          target="_blank"
          className="text-link"
        >
          <ArrowDownToLine size={17} /> Lieferliste
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
        <span>{shown.length} Artikel für deinen Geschmack</span>
        <span>Lieferpreise inkl. MwSt., zzgl. Pfand · Stand Februar 2026</span>
      </div>
      <div className="product-grid">
        {shown.map((p) => {
          const Icon =
            p.category === "Bier"
              ? Beer
              : ["Wein", "Sekt"].includes(p.category)
                ? Wine
                : p.category === "Mineralwasser"
                  ? Droplets
                  : GlassWater;
          return (
            <article className="product-card" key={p.id}>
              <div
                className={`product-visual ${p.category === "Bier" ? "beer" : p.category === "Mineralwasser" ? "water" : p.category === "Wein" ? "wine" : "soda"}`}
              >
                <span>{p.category}</span>
                <Icon size={66} strokeWidth={1} />
                <small>{pack(p)}</small>
              </div>
              <div className="product-info">
                <small>{p.sku}</small>
                <h3>{p.name}</h3>
                <p>
                  {pack(p)}
                  {p.volume_ml > 0 &&
                    ` · ${euro(Math.round(p.price_cents / ((p.pack_count * p.volume_ml) / 1000)))}/l`}
                </p>
                <div className="product-price">
                  <div>
                    <strong>{euro(p.price_cents)}</strong>
                    <small>
                      {p.deposit_cents === null
                        ? "zzgl. Pfand · Betrag auf Anfrage"
                        : `zzgl. ${euro(p.deposit_cents)} Pfand`}
                    </small>
                  </div>
                  <button
                    aria-label={`${p.name} zur Auswahl hinzufügen`}
                    onClick={() => add(p)}
                  >
                    <Plus size={20} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!shown.length && (
        <div className="empty">
          <Search size={35} />
          <h3>Gerade nichts gefunden.</h3>
          <p>Probiere einen anderen Suchbegriff oder eine andere Kategorie.</p>
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
        Sorten-Sammelpositionen aus dem Originalflyer werden bei der
        persönlichen Bestätigung konkretisiert. Abbildungen und Symbole sind
        illustrativ. Preise und Pfand werden vor Annahme der Anfrage bestätigt.
      </p>
    </>
  );
}
