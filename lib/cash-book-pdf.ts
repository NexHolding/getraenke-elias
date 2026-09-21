import type { jsPDF } from "jspdf";
import type { CashBookReport } from "./cash-book";
import type { Settings } from "./types";
import { euro } from "./money";
import { receiptLogo } from "./receipt-logo";
const dateLabel = (s: string) =>
  new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
  });
export async function appendCashBookPdf(
  doc: jsPDF,
  r: CashBookReport,
  settings: Partial<Settings>,
  newPage = true,
) {
  const { default: autoTable } = await import("jspdf-autotable");
  if (newPage) doc.addPage("a4", "landscape");
  const firstPage = doc.getNumberOfPages();
  const green: [number, number, number] = [85, 110, 40];
  const header = () => {
    doc.setTextColor(42, 51, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Kassenbuch · " + r.period, 14, 22);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(settings.business_name || "Getränkeshop Elias", 14, 29);
    doc.text(settings.business_address || "", 14, 34);
    const props = doc.getImageProperties(receiptLogo);
    doc.addImage(
      receiptLogo,
      "PNG",
      239,
      10,
      44,
      (44 * props.height) / props.width,
    );
    doc.setTextColor(...green);
    doc.text(r.mode, 14, 41);
  };
  const foot = () => {
    doc.setFontSize(7);
    doc.setTextColor(100, 110, 100);
    doc.text(
      "Nur Bargeld · EC / SumUp nicht enthalten · Kein zusätzlicher Umsatz durch Geldüberträge",
      14,
      196,
    );
    doc.text(
      "Erstellt " +
        new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) +
        " · Seite " +
        doc.getCurrentPageInfo().pageNumber,
      14,
      201,
    );
  };
  header();
  doc.setTextColor(42, 51, 42);
  doc.setFontSize(9);
  doc.text(
    `Vortrag ${euro(r.opening)}   |   Eingänge ${euro(r.income)}   |   Ausgänge ${euro(r.expenses)}   |   Endbestand ${euro(r.ending)}`,
    14,
    49,
  );
  autoTable(doc, {
    startY: 55,
    margin: { top: 46, left: 14, right: 14, bottom: 20 },
    head: [
      [
        "Tag",
        "Anfang",
        "Soll vor Zählung",
        "Gezählt",
        "Differenz",
        "Entnahme / Einlage",
        "Nächster Anfang",
        "Abschluss",
      ],
    ],
    body: r.days.map((d) => [
      dateLabel(d.day),
      euro(d.opening_cents),
      d.expected_cents === null ? "offen" : euro(d.expected_cents),
      d.counted_cents === null ? "–" : euro(d.counted_cents),
      d.difference_cents === null ? "–" : euro(d.difference_cents),
      d.counted_cents === null
        ? "–"
        : euro((d.next_opening_cents || 0) - d.counted_cents),
      d.next_opening_cents === null ? "–" : euro(d.next_opening_cents),
      d.closed_at
        ? new Date(d.closed_at).toLocaleString("de-DE", {
            timeZone: "Europe/Berlin",
          })
        : "Noch offen",
    ]),
    styles: { fontSize: 7.5, cellPadding: 2.2, overflow: "linebreak" },
    headStyles: { fillColor: green },
    alternateRowStyles: { fillColor: [245, 248, 238] },
    didDrawPage: () => {
      if (doc.getCurrentPageInfo().pageNumber !== firstPage) header();
      foot();
    },
  });
  const y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 10;
  autoTable(doc, {
    startY: y,
    margin: { top: 46, left: 14, right: 14, bottom: 20 },
    head: [
      [
        "KB-Nr. / Tag",
        "Zweck / Kategorie",
        "Beleg / Referenz",
        "Eingang",
        "Ausgang",
        "Bestand",
        "Erfasst durch",
      ],
    ],
    body: r.entries.map((e) => [
      `KB-${e.number}\n${dateLabel(e.day)} · ${new Date(e.created_at).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })}`,
      `${e.description}\n${e.category}`,
      `${e.reference || "–"}${e.document_date ? "\nBelegdatum " + dateLabel(e.document_date) : ""}${e.has_document ? "\nAnhang gespeichert" : ""}`,
      e.amount_cents > 0 ? euro(e.amount_cents) : "–",
      e.amount_cents < 0 ? euro(-e.amount_cents) : "–",
      euro(e.balance_cents),
      e.actor_name,
    ]),
    styles: { fontSize: 7.2, cellPadding: 2.2, overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 85 },
      2: { cellWidth: 48 },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    headStyles: { fillColor: green },
    alternateRowStyles: { fillColor: [245, 248, 238] },
    didDrawPage: () => {
      header();
      foot();
    },
  });
  if (!r.entries.length) {
    doc.setFontSize(10);
    doc.text("Keine Kassenbucheinträge in diesem Zeitraum.", 14, 72);
  }
  return doc;
}
export async function createCashBookPdf(
  r: CashBookReport,
  settings: Partial<Settings>,
) {
  const { jsPDF } = await import("jspdf");
  return appendCashBookPdf(
    new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }),
    r,
    settings,
    false,
  );
}
