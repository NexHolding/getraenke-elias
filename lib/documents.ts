import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { euro, totals } from "./money";
import type { Delivery, Invoice, Order, Settings } from "./types";
export function businessDocument(
  kind: "invoice" | "delivery",
  record: Invoice | Delivery,
  order: Order,
  cfg: Settings,
) {
  const snapshot = record as typeof record & {
    order_snapshot?: Order;
    business_snapshot?: Settings;
  };
  if (snapshot.order_snapshot?.id) order = snapshot.order_snapshot;
  if (snapshot.business_snapshot?.business_name)
    cfg = snapshot.business_snapshot;
  const doc = new jsPDF();
  const title = kind === "invoice" ? "Rechnung" : "Lieferschein";
  const number = `${kind === "invoice" ? "RE" : "LS"}-${String(record.number).padStart(6, "0")}`;
  doc.setFillColor(35, 48, 34);
  doc.rect(0, 0, 210, 40, "F");
  doc.setTextColor(196, 219, 116);
  doc.setFontSize(12);
  doc.text("GETRÄNKESHOP ELIAS", 16, 14);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(title, 16, 29);
  doc.setFontSize(10);
  doc.text(number, 194, 29, { align: "right" });
  doc.setTextColor(40, 45, 35);
  doc.setFontSize(10);
  const invoice = kind === "invoice" ? (record as Invoice) : null;
  const recipient = invoice?.customer_snapshot || {
    name: order.customer_name,
    address: order.address,
    email: order.email,
  };
  doc.text(
    doc.splitTextToSize(`${recipient.name}\n${recipient.address}`, 95),
    16,
    52,
  );
  doc.text(
    [
      `Datum: ${new Date(record.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`,
      `Auftrag: EL-${String(order.number).padStart(5, "0")}`,
    ],
    130,
    52,
  );
  autoTable(doc, {
    startY: 77,
    margin: { left: 16, right: 16, bottom: 35 },
    head: [
      kind === "invoice"
        ? ["Artikel", "Menge", "USt.", "Netto", "Brutto", "Pfand"]
        : ["Artikel", "Bestellt", "Diese Lieferung", "Noch offen"],
    ],
    body: record.items.map((l) => {
      const o = order.items.find((x) => x.id === l.id);
      return kind === "invoice"
        ? [
            l.name,
            l.quantity,
            `${l.tax_rate}%`,
            euro(
              Math.round(
                (l.quantity * l.price_cents * 100) / (100 + l.tax_rate),
              ),
            ),
            euro(l.quantity * l.price_cents),
            euro(l.quantity * l.deposit_cents),
          ]
        : [
            l.name,
            o?.quantity || l.quantity,
            l.quantity,
            Math.max(
              0,
              (o?.quantity || 0) -
                (order.delivered?.[l.id] || 0) -
                (record.status === "draft" ? l.quantity : 0),
            ),
          ];
    }),
    headStyles: { fillColor: [45, 63, 38] },
    styles: { fontSize: 9, cellPadding: 4 },
    alternateRowStyles: { fillColor: [247, 249, 240] },
  });
  let y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;
  if (y + 65 > 260) {
    doc.addPage();
    y = 22;
  }
  if (invoice) {
    const t = totals(invoice.items);
    doc.setFontSize(11);
    doc.text(
      `Rechnungsbetrag inkl. Pfand: ${euro(invoice.total_cents)}`,
      194,
      y,
      { align: "right" },
    );
    y += 8;
    doc.setFontSize(9);
    doc.text(
      `Netto ${euro(invoice.net_cents)} · Umsatzsteuer ${euro(invoice.tax_cents)}`,
      194,
      y,
      { align: "right" },
    );
    for (const [rate, v] of Object.entries(t.taxes)) {
      y += 6;
      doc.text(
        `${rate}% USt.: Netto ${euro(v.net)} / Steuer ${euro(v.tax)}`,
        194,
        y,
        { align: "right" },
      );
    }
    y += 8;
    doc.text(
      `Leistungsdatum: ${new Date(record.created_at).toLocaleDateString("de-DE")} · ${invoice.status === "paid" ? "Bezahlt" : "Zahlungsstatus: offen"}`,
      16,
      y,
    );
  } else {
    const d = record as Delivery;
    doc.text(`Empfang: ${d.signed_name || "Noch nicht bestätigt"}`, 16, y);
    if (d.signature) {
      try {
        doc.addImage(d.signature, "PNG", 16, y + 4, 65, 25);
      } catch {
        doc.text("Signaturdatei kann nicht dargestellt werden", 16, y + 12);
      }
    } else if (d.status === "delivered")
      doc.text("Abgestellt gemäß gespeicherter Abstellgenehmigung.", 16, y + 8);
  }
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(95, 105, 80);
    doc.text(cfg.business_name || "Getränkeshop Elias · Frank Elias", 16, 276);
    doc.text(
      cfg.business_address || "Wartbergstraße 3 · 74076 Heilbronn",
      16,
      281,
    );
    doc.text(
      cfg.tax_number
        ? `Steuernummer / USt-IdNr.: ${cfg.tax_number}`
        : "Einrichtungsbeleg · Noch kein steuerlicher Echtbetrieb",
      16,
      286,
    );
    if (record.mode === "setup")
      doc.text("EINRICHTUNG", 194, 281, { align: "right" });
    doc.text(`${p} / ${doc.getNumberOfPages()}`, 194, 286, { align: "right" });
  }
  return {
    bytes: Buffer.from(doc.output("arraybuffer")),
    filename: `Elias-${number}.pdf`,
  };
}
