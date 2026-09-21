"use client";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Search,
  X,
  Package,
  Droplets,
  Wine,
  Beer,
  CupSoda,
} from "lucide-react";
import {
  catalogBrands,
  catalogCategories,
  productBrand,
  searchProducts,
} from "@/lib/pos-catalog";
import type { Product } from "@/lib/types";
import { euro, pack } from "@/lib/money";
import { ProductPhoto } from "./product-photo";

export default function POSCatalog({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [query, setQuery] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scan = (event: Event) => {
      const barcode = (event as CustomEvent).detail?.barcode;
      if (
        typeof barcode === "string" &&
        /^[A-Za-z0-9 ._-]{1,80}$/.test(barcode)
      ) {
        setQuery(barcode);
        setCategory("");
        setBrand("");
      }
    };
    window.addEventListener("elias:native-scan", scan);
    return () => window.removeEventListener("elias:native-scan", scan);
  }, []);
  useEffect(() => {
    list.current?.scrollTo({ top: 0 });
  }, [category, brand, query]);
  const searching = !!query.trim();
  const choices = searching
    ? searchProducts(products, query)
    : products.filter(
        (p) => p.active && p.category === category && productBrand(p) === brand,
      );
  const label = (value: string) =>
    value === "Mineralwasser" ? "Wasser" : value;
  return (
    <div className="pos-catalog-browser">
      <label className="search-field">
        <Search size={20} />
        <input
          id="pos-search"
          aria-label="Artikel oder Barcode suchen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Artikel, Marke oder Barcode suchen"
          autoComplete="off"
        />
        {query && (
          <button
            className="icon-button"
            onClick={() => setQuery("")}
            aria-label="Suche löschen"
          >
            <X size={18} />
          </button>
        )}
      </label>
      <nav className="pos-breadcrumb" aria-label="Artikelauswahl">
        <button
          onClick={() => {
            setCategory("");
            setBrand("");
            setQuery("");
          }}
        >
          Sortiment
        </button>
        {category && (
          <>
            <ChevronRight size={16} />
            <button
              onClick={() => {
                setBrand("");
                setQuery("");
              }}
            >
              {label(category)}
            </button>
          </>
        )}
        {brand && (
          <>
            <ChevronRight size={16} />
            <span>{brand}</span>
          </>
        )}
        {searching && <span>· Suchergebnisse</span>}
      </nav>
      <div className="pos-catalog-scroll" ref={list}>
        <div className="pos-catalog-heading">
          <h2>
            {searching
              ? "Suchergebnisse"
              : brand
                ? `${brand} · Varianten`
                : category
                  ? "Marke auswählen"
                  : "Was darf es sein?"}
          </h2>
          <span>
            {searching || brand
              ? `${choices.length} Artikel`
              : category
                ? label(category)
                : "Kategorie → Marke → Variante"}
          </span>
        </div>
        {!searching && !category ? (
          <div className="pos-choice-grid">
            {catalogCategories(products).map((c) => {
              const Icon =
                c === "Mineralwasser"
                  ? Droplets
                  : c === "Bier"
                    ? Beer
                    : ["Wein", "Sekt"].includes(c)
                      ? Wine
                      : c === "Für Ihre Feier"
                        ? Package
                        : CupSoda;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className="pos-category-choice"
                >
                  <Icon size={30} />
                  <strong>{label(c)}</strong>
                  <small>
                    {
                      products.filter((p) => p.active && p.category === c)
                        .length
                    }{" "}
                    Artikel
                  </small>
                  <ChevronRight size={18} />
                </button>
              );
            })}
          </div>
        ) : !searching && !brand ? (
          <div className="pos-choice-grid">
            {catalogBrands(products, category).map((b) => (
              <button
                className="pos-brand-choice"
                key={b}
                onClick={() => setBrand(b)}
              >
                <span className="pos-brand-monogram" aria-hidden="true">
                  {b.slice(0, 2).toUpperCase()}
                </span>
                <strong>{b}</strong>
                <small>
                  {
                    products.filter(
                      (p) =>
                        p.active &&
                        p.category === category &&
                        productBrand(p) === b,
                    ).length
                  }{" "}
                  Varianten / Gebinde
                </small>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="pos-products">
            {choices.map((p) => (
              <button
                key={p.id}
                disabled={p.deposit_cents === null}
                aria-label={`${p.name}, ${pack(p)}, ${euro(p.price_cents)} hinzufügen`}
                onClick={() => onSelect(p)}
              >
                <ProductPhoto product={p} />
                <span className="pos-variant">{p.variant || p.name}</span>
                <strong>{p.name}</strong>
                <span className="pos-pack">{pack(p)}</span>
                <small>Art. {p.sku}</small>
                <b>{euro(p.price_cents)}</b>
                <small>
                  {p.deposit_cents === null
                    ? "Pfand zuerst prüfen"
                    : `+ ${euro(p.deposit_cents)} Pfand`}{" "}
                  · {p.tax_rate} % MwSt.
                </small>
              </button>
            ))}
          </div>
        )}
        {(searching || brand) && choices.length === 0 && (
          <p className="empty">
            Keine passenden Artikel. Suche ändern oder zum Sortiment
            zurückgehen.
          </p>
        )}
      </div>
    </div>
  );
}
