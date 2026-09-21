import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { receiptLogo } from "./receipt-logo";
import { euro } from "./money";
import { paymentLabels } from "./billing";
import type { Order, Settings } from "./types";
export function deliveryListPdf(orders: Order[], date: string, cfg: Settings) {
  const doc = new jsPDF({ orientation: "landscape" });
  const header = () => {
    doc.setTextColor(42, 54, 35);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.text("Lieferliste", 14, 23);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${date.split("-").reverse().join(".")} · ${orders.length} Stopps · ${cfg.business_name || "Getränkeshop Elias"}`,
      14,
      32,
    );
    const logo = doc.getImageProperties(receiptLogo);
    doc.addImage(
      receiptLogo,
      "PNG",
      244,
      12,
      38,
      (38 * logo.height) / logo.width,
    );
  };
  header();
  const rows = orders.map((order, index) => {
    const lines = order.items
      .map((item) => ({
        ...item,
        quantity: Math.max(
          0,
          item.quantity - (order.delivered?.[item.id] || 0),
        ),
      }))
      .filter((item) => item.quantity > 0);
    const amount = lines.reduce(
      (sum, item) =>
        sum + item.quantity * (item.price_cents + (item.deposit_cents || 0)),
      0,
    );
    const method = order.approved_payment_method;
    const customer = `${order.customer_name}\n${order.address}\n${order.phone}\nEL-${String(order.number).padStart(5, "0")}`;
    return [
      String(index + 1),
      `${order.eta_start || "–"}–${order.eta_end || "–"}`,
      customer,
      lines.map((item) => `${item.quantity} × ${item.name}`).join("\n"),
      `${method ? paymentLabels[method] : "Freigabe fehlt"}\n${euro(amount)} inkl. Pfand${method === "invoice" ? "\nNicht kassieren" : method ? "\nVor Ort kassieren" : ""}`,
      `${order.notes || ""}${order.preference_snapshot?.dropoff_allowed ? "\nAbstellen: " + (order.preference_snapshot.dropoff_note || "erlaubt") : ""}`,
    ];
  });
  autoTable(doc, {
    startY: 42,
    margin: { top: 42, bottom: 17, left: 14, right: 14 },
    head: [
      [
        "Stopp",
        "Zeit",
        "Kunde / Adresse",
        "Artikel · offene Menge",
        "Zahlung · Sollbetrag",
        "Hinweise",
      ],
    ],
    body: rows.length
      ? rows
      : [["–", "–", "Keine offenen Lieferungen für diesen Tag.", "", "", ""]],
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: "linebreak",
      textColor: [42, 54, 35],
    },
    headStyles: { fillColor: [235, 241, 219], textColor: [42, 54, 35] },
    alternateRowStyles: { fillColor: [248, 250, 244] },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 24 },
      2: { cellWidth: 61 },
      3: { cellWidth: 76 },
      4: { cellWidth: 40 },
      5: { cellWidth: 52 },
    },
    rowPageBreak: "avoid",
    didDrawPage: () => header(),
  });
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(95, 105, 84);
    doc.text(
      `Planungsstand · tatsächliche Liefermengen vor Übergabe prüfen · Seite ${page}/${doc.getNumberOfPages()}`,
      14,
      202,
    );
  }
  return Buffer.from(doc.output("arraybuffer"));
}
