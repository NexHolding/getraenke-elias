"use client";
import Image from "next/image";
import { useState } from "react";
import { Package, Wine, Beer, BottleWine } from "lucide-react";
import imageNotes from "@/data/product-image-notes.json";
import type { Product } from "@/lib/types";

export function ProductPhoto({ product }: { product: Product }) {
  const [failedSource, setFailedSource] = useState<string>();
  const source = product.image_url;
  const note = source
    ? (imageNotes as Record<string, string>)[source]
    : undefined;
  const Icon =
    product.category === "Bier"
      ? Beer
      : ["Wein", "Sekt"].includes(product.category)
        ? Wine
        : product.kind === "rental"
          ? Package
          : BottleWine;

  return source && source !== failedSource ? (
    <div className={`product-photo${note ? " has-image-note" : ""}`}>
      <Image
        src={source}
        alt={note ? `${product.name} – ${note}` : product.name}
        fill
        sizes="(max-width: 640px) 160px, 300px"
        unoptimized={!source.startsWith("/products/")}
        onError={() => setFailedSource(source)}
      />
      {note && <span className="product-image-note">{note}</span>}
    </div>
  ) : (
    <div className="product-placeholder">
      <Icon size={52} strokeWidth={1} />
      <small>Abbildung nicht verfügbar</small>
    </div>
  );
}
