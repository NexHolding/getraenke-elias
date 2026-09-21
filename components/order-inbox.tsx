"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { Order } from "@/lib/types";
import { euro } from "@/lib/money";
import OrderStockInfo from "./order-stock-info";
import { useDialog } from "./use-dialog";
export default function OrderInbox({
  operatorId,
  canManageOrders,
  onChanged,
}: {
  operatorId: string;
  canManageOrders: boolean;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refreshPage = useEffectEvent(() => {
    void onChanged().catch(() => {});
  });
  const fingerprint = useRef("");
  const generation = useRef(0);
  const acknowledging = useRef(false);
  const current = orders[0];
  useEffect(() => {
    let active = true,
      running = false;
    const abort = new AbortController();
    async function poll() {
      if (
        running ||
        acknowledging.current ||
        document.visibilityState === "hidden"
      )
        return;
      running = true;
      const epoch = generation.current;
      try {
        const response = await fetch("/api/order-inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh" }),
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok)
          throw new Error(
            "Bestelleingang derzeit nicht erreichbar. Bitte Verbindung prüfen.",
          );
        const data = await response.json();
        if (!active || acknowledging.current || epoch !== generation.current)
          return;
        const list: Order[] = data.orders || [];
        const next =
          String(data.revision || "") +
          JSON.stringify(
            list.map((o) => [
              o.id,
              o.status,
              o.stock_check,
              o.approved_payment_method,
            ]),
          );
        if (fingerprint.current !== next) {
          fingerprint.current = next;
          setOrders(list);
          if (!list.length) setOpen(false);
          refreshPage();
        }
        setError("");
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Bestelleingang nicht erreichbar.",
          );
      } finally {
        running = false;
      }
    }
    void poll();
    const timer = setInterval(() => void poll(), 10000);
    const visible = () => void poll();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      active = false;
      abort.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [operatorId]);
  useEffect(() => {
    if (open || !orders.length) return;
    const show = () => {
      if (
        !document.querySelector('[role="dialog"]') &&
        document.visibilityState !== "hidden"
      )
        setOpen(true);
    };
    show();
    const timer = setInterval(show, 1000);
    return () => clearInterval(timer);
  }, [orders.length, open]);
  async function seen(navigate = false) {
    if (!current || acknowledging.current) return;
    acknowledging.current = true;
    generation.current++;
    setBusy(true);
    try {
      const response = await fetch("/api/order-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seen", id: current.id }),
      });
      if (!response.ok)
        throw new Error("Hinweis konnte nicht als gelesen gespeichert werden.");
      const data = await response.json();
      setOrders(data.orders || []);
      setOpen(false);
      setError("");
      if (navigate)
        router.push(
          canManageOrders
            ? `/crm/bestellungen#auftrag-${current.id}`
            : "/crm/lieferung",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bitte erneut versuchen.");
    } finally {
      acknowledging.current = false;
      setBusy(false);
    }
  }
  useDialog(open && !!current, () => {
    if (!busy) void seen();
  });
  return (
    <>
      {(orders.length > 0 || error) && (
        <button
          className="order-inbox-launch button"
          onClick={() => setOpen(!!current)}
          aria-label="Bestelleingang öffnen"
        >
          <Bell size={18} />
          {orders.length
            ? `${orders.length} neue Bestellung${orders.length === 1 ? "" : "en"}`
            : "Bestelleingang: Verbindung prüfen"}
        </button>
      )}
      {error && !open && (
        <p className="order-inbox-error" role="status">
          {error}
        </p>
      )}
      {open && current && (
        <div className="modal-backdrop order-inbox-overlay">
          <section
            className="modal order-inbox-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Neue Bestellung"
          >
            <div className="panel-head">
              <div>
                <span className="eyebrow">
                  Bestelleingang · {orders.length} ungelesen
                </span>
                <h2>
                  Neue Bestellung EL-{String(current.number).padStart(5, "0")}
                </h2>
              </div>
              <span
                className={`badge ${current.status === "confirmed" ? "green" : ""}`}
              >
                {(
                  {
                    new: "Bestand prüfen",
                    confirmed: "Bestätigt",
                    delivering: "In Lieferung",
                    partial: "Teilweise geliefert",
                    completed: "Geliefert",
                    cancelled: "Storniert",
                  } as Record<string, string>
                )[current.status] || current.status}
              </span>
            </div>
            <h3>{current.customer_name}</h3>
            <p>{current.address}</p>
            <p>{current.phone}</p>
            <OrderStockInfo order={current} />
            {current.notes && <p>Hinweis: {current.notes}</p>}
            <p>
              <strong>
                Gesamt inklusive Pfand:{" "}
                {euro(
                  current.items.reduce(
                    (s, l) =>
                      s + l.quantity * (l.price_cents + (l.deposit_cents || 0)),
                    0,
                  ),
                )}
              </strong>
            </p>
            {error && (
              <p role="alert" className="notice">
                {error}
              </p>
            )}
            <div className="inline-actions">
              <button
                autoFocus
                className="button"
                disabled={busy}
                onClick={() => void seen()}
              >
                Gesehen
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void seen(true)}
              >
                {canManageOrders ? "Bestellung öffnen" : "Lieferplanung öffnen"}
              </button>
            </div>
            <p className="fineprint">
              „Gesehen“ schließt nur diesen Hinweis. Eine ausreichende
              Warenmenge wird automatisch bestätigt.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
