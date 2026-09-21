"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nativeApp } from "@/lib/native-app";

export default function CashRegisterLink({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <Link
      href="/crm/kasse"
      target="elias-kasse"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        if (nativeApp() === "pos") {
          event.preventDefault();
          router.push("/crm/kasse");
          return;
        }
        const popup = window.open(
          "/crm/kasse",
          "elias-kasse",
          "popup,width=1440,height=960",
        );
        if (popup) {
          event.preventDefault();
          popup.focus();
        }
        // Normal link remains a fallback when the browser blocks popups.
      }}
    >
      {children}
    </Link>
  );
}
