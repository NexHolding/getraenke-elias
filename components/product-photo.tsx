"use client";
import Image from "next/image";
import { Package, Wine, Beer, BottleWine } from "lucide-react";
import type { Product } from "@/lib/types";
export function ProductPhoto({ product }: { product: Product }) {
  const Icon =
    product.category === "Bier"
      ? Beer
      : ["Wein", "Sekt"].includes(product.category)
        ? Wine
        : product.kind === "rental"
          ? Package
          : BottleWine;
  return product.image_url ? (
    <Image
      className="product-photo"
      src={product.image_url}
      alt={product.name}
      width={300}
      height={300}
      unoptimized
    />
  ) : (
    <div className="product-placeholder">
      <Icon size={52} strokeWidth={1} />
      <small>Produktfoto folgt</small>
    </div>
  );
}
