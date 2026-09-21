import type { Order } from "@/lib/types";
export default function OrderStockInfo({ order }: { order: Order }) {
  const lines = order.stock_check || [];
  if (!lines.length) return null;
  const issues = lines.filter((l) => l.state !== "available");
  return (
    <section
      className={`order-stock-info ${issues.length ? "needs-stock" : "stock-ready"}`}
      aria-label="Bestandsprüfung"
    >
      <strong>
        {issues.length
          ? "Ware fehlt oder Bestand muss geprüft werden"
          : order.auto_confirmed_at
            ? "Bestätigt · automatisch bei ausreichendem Bestand"
            : "Ware verfügbar"}
      </strong>
      <p>Bereits zugesagte Mengen anderer Bestellungen sind berücksichtigt.</p>
      <div className="order-stock-table">
        <table>
          <thead>
            <tr>
              <th>Artikel</th>
              <th>Benötigt</th>
              <th>Verfügbar</th>
              <th>Hinweis</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.required}</td>
                <td>{l.available ?? "Unbekannt"}</td>
                <td>
                  {l.state === "unknown"
                    ? "Bestand unbekannt"
                    : l.state === "inactive"
                      ? "Artikel nicht verfügbar"
                      : l.state === "shortage"
                        ? `${l.missing} fehlen`
                        : "Vorrätig"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {order.status === "new" && (
        <p>
          Nach Wareneingang wird die Bestellung erneut geprüft und bei
          ausreichendem Bestand automatisch bestätigt.
        </p>
      )}
      {!order.approved_payment_method && (
        <p>
          Die Zahlungsart ist noch freizugeben. Eine Rechnungsanfrage gewährt
          keinen automatischen Rechnungskredit.
        </p>
      )}
    </section>
  );
}
