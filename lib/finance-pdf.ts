import type { jsPDF } from "jspdf";
import type { FinanceReport } from "./finance-report";
import { euro } from "./money";
import { receiptLogo } from "./receipt-logo";
const GREEN: [number, number, number] = [85, 110, 40],
  INK: [number, number, number] = [42, 51, 42],
  MUTED: [number, number, number] = [105, 115, 100],
  LIGHT: [number, number, number] = [243, 247, 232];
const clean = (s: string) =>
  s.replace(/[\u2010-\u2015]/g, "-").replace(/\u00a0/g, " ");
const labelPeriod = (period: string) =>
  new Intl.DateTimeFormat(
    "de-DE",
    period.length === 7
      ? { month: "long", year: "numeric", timeZone: "Europe/Berlin" }
      : {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "Europe/Berlin",
        },
  ).format(
    new Date(period + (period.length === 7 ? "-01" : "") + "T12:00:00Z"),
  );
export async function createFinancePdf(r: FinanceReport) {
  const { jsPDF } = await import("jspdf"),
    { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }),
    W = 297,
    H = 210,
    M = 14;
  const text = (
    value: string,
    x: number,
    y: number,
    size = 8,
    color = INK,
    bold = false,
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(clean(value), x, y);
  };
  function header(section: string, first = false) {
    doc.setFillColor(...GREEN);
    doc.rect(M, 10, 1.3, first ? 35 : 21, "F");
    text("ELIAS / FINANZEN", M + 5, 14, 7.4, GREEN, true);
    text(
      first ? r.title : section,
      M + 5,
      first ? 25 : 24,
      first ? 22 : 15,
      INK,
      true,
    );
    text(
      labelPeriod(r.period) + (first ? " · Umsatzübersicht" : " · " + r.title),
      M + 5,
      first ? 33 : 31,
      9,
      MUTED,
    );
    const logo = doc.getImageProperties(receiptLogo);
    doc.addImage(
      receiptLogo,
      "PNG",
      W - M - 49,
      9,
      49,
      (49 * logo.height) / logo.width,
    );
    if (first) {
      text(r.business_name, M + 5, 40, 8, INK);
      text(r.business_address, M + 5, 45, 7.5, MUTED);
    }
    doc.setDrawColor(223, 230, 212);
    doc.line(M, first ? 50 : 36, W - M, first ? 50 : 36);
  }
  function section(title: string, y: number) {
    text(title, M, y, 11, GREEN, true);
    return y + 4;
  }
  function table(
    head: string[],
    body: (string | number)[][],
    y: number,
    widths?: Record<number, object>,
    continuation = "Belegjournal · Fortsetzung",
  ) {
    autoTable(doc, {
      startY: y,
      margin: { top: 43, left: M, right: M, bottom: 22 },
      head: [head],
      body,
      theme: "plain",
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 1.35,
        textColor: INK,
        lineColor: [228, 234, 219],
        lineWidth: 0.1,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: LIGHT,
        textColor: GREEN,
        fontStyle: "bold",
        fontSize: 7.3,
      },
      alternateRowStyles: { fillColor: [250, 251, 247] },
      columnStyles: widths || {},
      showHead: "everyPage",
      rowPageBreak: "avoid",
      willDrawPage: ({ pageNumber }) => {
        if (pageNumber > 1) header(continuation);
      },
    });
    return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
  }
  header("Umsatzübersicht", true);
  const cards = [
    ["UMSATZ BRUTTO", euro(r.all.gross), "inklusive Pfandsaldo"],
    ["NETTO", euro(r.all.net), "aus gespeicherten Belegen"],
    ["UMSATZSTEUER", euro(r.all.tax), "nach Steuersätzen aufgeteilt"],
    ["PFANDSALDO BRUTTO", euro(r.all.deposit), "Ausgabe abzüglich Rücknahme"],
  ];
  cards.forEach(([title, value, note], i) => {
    const x = M + i * 69;
    doc.setFillColor(
      ...(i === 0 ? LIGHT : ([248, 249, 245] as [number, number, number])),
    );
    doc.roundedRect(x, 57, 62, 29, 2, 2, "F");
    text(title, x + 4, 64, 7, GREEN, true);
    text(value, x + 4, 74, 17, INK, true);
    text(note, x + 4, 81, 6.8, MUTED);
  });
  text(
    `${r.documents.length} Belege · ${r.mode} · Waren/Leistungen ohne Pfand (brutto): ${euro(r.all.gross - r.all.deposit)}`,
    M,
    94,
    8,
    MUTED,
  );
  section("Umsatz nach Belegart", 104);
  table(
    ["Herkunft / Zahlart", "Belege", "Netto", "Umsatzsteuer", "Brutto"],
    [
      ["Kassenbons · Bar", ...group(r, "Bar")],
      ["Kassenbons · Karte", ...group(r, "Karte")],
      ["Lieferrechnungen · offen + bezahlt", ...group(r, "Rechnung")],
      [
        "Gesamt",
        r.documents.length,
        euro(r.all.net),
        euro(r.all.tax),
        euro(r.all.gross),
      ],
    ],
    108,
    {
      0: { cellWidth: 116 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
    },
  );
  section("Steuerübersicht", 153);
  table(
    ["Steuersatz", "Netto", "Umsatzsteuer", "Brutto"],
    Object.entries(r.taxes)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([rate, v]) => [
        rate + " %",
        euro(v.net),
        euro(v.tax),
        euro(v.gross),
      ])
      .concat(
        Object.keys(r.taxes).length
          ? []
          : [["Keine Belege", "0,00 €", "0,00 €", "0,00 €"]],
      ),
    157,
    {
      0: { cellWidth: 116 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  );
  doc.addPage();
  header(
    r.period.length === 7
      ? "Verlauf & Abstimmung"
      : "Tagesabgleich & Belegjournal",
  );
  let y = 44;
  const daily = Object.entries(r.days).sort(([a], [b]) => a.localeCompare(b));
  if (r.period.length === 7 && daily.length) {
    text(
      "Tagesumsatz brutto · Kasse und Lieferrechnungen",
      M,
      y,
      10,
      GREEN,
      true,
    );
    y += 6;
    const max = Math.max(...daily.map(([, v]) => Math.abs(v.gross)), 1),
      chartHeight = 24,
      dayCount = new Date(
        Number(r.period.slice(0, 4)),
        Number(r.period.slice(5, 7)),
        0,
      ).getDate(),
      barWidth = 249 / dayCount;
    doc.setDrawColor(220, 228, 205);
    doc.line(M, y + chartHeight, W - M, y + chartHeight);
    for (let day = 1; day <= dayCount; day++) {
      const d = r.days[`${r.period}-${String(day).padStart(2, "0")}`],
        height = d ? (Math.abs(d.gross) / max) * chartHeight : 0,
        x = M + (day - 1) * (269 / dayCount);
      doc.setFillColor(
        ...(d?.gross < 0
          ? ([189, 142, 90] as [number, number, number])
          : ([172, 192, 113] as [number, number, number])),
      );
      if (height) doc.rect(x, y + chartHeight - height, barWidth, height, "F");
      text(String(day), x + 0.5, y + chartHeight + 4, 6, MUTED);
    }
    text(
      "Balkenhöhe = Betrag · Erstattungen in Braun · genaue Werte in der Tagesübersicht",
      M,
      y + chartHeight + 9,
      6.8,
      MUTED,
    );
    y += 39;
  }
  text(
    `Offene Lieferrechnungen dieses Zeitraums: ${euro(r.all.openInvoices)} (Status bei Berichterstellung)`,
    M,
    y + 2,
    8,
    INK,
    true,
  );
  text(
    "Rechnungsumsatz wird nach Belegdatum ausgewiesen. Offene Rechnungen sind keine Zahlungseingänge.",
    M,
    y + 8,
    7.5,
    MUTED,
  );
  y += 17;
  if (daily.length) {
    y =
      table(
        ["Tag (Berlin)", "Belege", "Netto", "USt.", "Brutto", "Pfandsaldo"],
        daily.map(([day, v]) => [
          day.split("-").reverse().join("."),
          v.count,
          euro(v.net),
          euro(v.tax),
          euro(v.gross),
          euro(v.deposit),
        ]),
        y,
        {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
        },
        "Tagesübersicht · Fortsetzung",
      ) + 10;
  }
  let freshBasisPage = false;
  if (y > 151) {
    freshBasisPage = true;
    doc.addPage();
    header("Abschlussabgleich");
    y = 45;
  }
  text("Kassenabschluss & Datenbasis", M, y, 10, GREEN, true);
  y += 6;
  const close = r.closings.find(
    (c) =>
      c.period === r.period &&
      c.kind === (r.period.length === 7 ? "month" : "day"),
  );
  const note = close
    ? `Kassenabschluss gespeichert am ${new Date(close.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}. Kassenbrutto: ${euro(close.totals.gross)}. Abweichung zum Bericht: ${euro(r.all.pos - close.totals.gross)}.`
    : "Für diesen Zeitraum ist kein passender Kassenabschluss gespeichert. Der Bericht ist eine aktuelle Auswertung.";
  const notes = [
    note,
    `Dokumentierte Tagesabschlüsse im Zeitraum: ${r.closings.filter((c) => c.kind === "day").length}. Lieferrechnungen gehören nicht zum Kassenabschluss.`,
    ...(close?.kind === "day"
      ? [
          `Kassenbestand: Anfang ${euro(close.totals.opening ?? 0)} · Gezählt ${euro(close.totals.counted ?? 0)} · Zähldifferenz ${euro(close.totals.difference ?? 0)}.`,
        ]
      : []),
    "Grundlage: unveränderte Belegpositionen; Pfand inklusive zugehöriger Steuer; Rabatte bereits berücksichtigt.",
    "CSV enthält ein Belegjournal mit getrennten Steuerbeträgen (0 / 7 / 19 %). Beträge in EUR, Dezimalkomma, UTF-8.",
    "Die Übersicht ist eine Abstimmungsunterlage, kein DATEV-Buchungsstapel, DSFinV-K-Export oder Steuerformular.",
  ];
  for (const n of notes) {
    doc.setFontSize(7.3);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(clean(n), 269);
    doc.setTextColor(...MUTED);
    doc.text(lines, M, y);
    y += lines.length * 3.5 + 2;
  }
  if ((r.period.length === 7 && !freshBasisPage) || y > 139) {
    doc.addPage();
    header("Belegjournal");
    y = 44;
  } else {
    y += 7;
    section("Belegjournal", y);
    y += 5;
  }
  table(
    [
      "Beleg",
      "Datum / Uhrzeit (Berlin)",
      "Art / Zahlart",
      "Status",
      "Netto",
      "USt.",
      "Brutto",
      "Pfandsaldo",
    ],
    r.documents.length
      ? r.documents.map((d) => [
          d.number,
          new Date(d.created_at).toLocaleString("de-DE", {
            timeZone: "Europe/Berlin",
          }),
          `${d.kind} / ${d.payment}`,
          [d.status, d.reference ? `zu ${d.reference}` : "", d.reason]
            .filter(Boolean)
            .join(" · "),
          euro(d.net),
          euro(d.tax),
          euro(d.gross),
          euro(d.deposit),
        ])
      : [["Keine Belege im ausgewählten Zeitraum", "", "", "", "", "", "", ""]],
    y,
    {
      0: { cellWidth: 23 },
      1: { cellWidth: 43 },
      2: { cellWidth: 58 },
      3: { cellWidth: 23 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
  );
  if (r.payments.length) {
    doc.addPage();
    header("Zahlungseingänge Lieferrechnungen");
    text(
      "Separates Zahlungsjournal - kein zusätzlicher Umsatz",
      M,
      42,
      9,
      MUTED,
    );
    text(
      `Bar ${euro(r.received.cash)} / EC ${euro(r.received.card)} / Überweisung ${euro(r.received.bank)}`,
      M,
      49,
      9,
      INK,
      true,
    );
    table(
      ["Rechnung", "Kunde", "Zahlungstag (Berlin)", "Zahlungsart", "Betrag"],
      r.payments.map((p) => [
        `RE-${p.number}`,
        p.customer,
        berlinDateLabel(p.paid_at),
        p.method === "cash"
          ? "Bar"
          : p.method === "card"
            ? "EC-Karte"
            : "Überweisung",
        euro(p.amount_cents),
      ]),
      57,
      { 4: { halign: "right" } },
    );
  }
  const pages = doc.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n);
    doc.setDrawColor(225, 232, 217);
    doc.line(M, H - 17, W - M, H - 17);
    text(`${r.title} · ${r.period} · ${r.mode}`, M, H - 12, 7, MUTED);
    text(
      `Erstellt: ${new Date(r.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · ${n} / ${pages}`,
      W - 100,
      H - 12,
      7,
      MUTED,
    );
    text(
      r.tax_number
        ? `Steuernummer: ${r.tax_number}`
        : r.vat_id
          ? `USt-IdNr.: ${r.vat_id}`
          : "Steueridentität noch nicht hinterlegt",
      M,
      H - 7,
      6.8,
      MUTED,
    );
  }
  return doc;
}
function group(r: FinanceReport, payment: string) {
  const rows = r.documents.filter((d) => d.payment === payment);
  return [
    rows.length,
    euro(rows.reduce((n, d) => n + d.net, 0)),
    euro(rows.reduce((n, d) => n + d.tax, 0)),
    euro(rows.reduce((n, d) => n + d.gross, 0)),
  ];
}

function berlinDateLabel(date: string) {
  return new Date(date).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
  });
}
