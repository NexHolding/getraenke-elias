import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { euro } from "./money";
import {
  inventoryValue,
  inventoryEventDetail,
  reasonLabel,
  type InventoryRun,
  type InventoryLine,
  type StockAdjustment,
  type InventoryEvent,
} from "./inventory";
import type { Settings } from "./types";
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "-";
const money = (n: number | null) => (n === null ? "Nicht bewertet" : euro(n));
const status = {
  counting: "Entwurf - Zählung läuft",
  review: "Zur Prüfung - noch nicht übernommen",
  applied: "Abgeschlossen - Bestand übernommen",
  cancelled: "Abgebrochen - keine Übernahme",
};
const number = (prefix: string, n: number) =>
  `${prefix}-${String(n).padStart(6, "0")}`;
function frame(title: string, id: string, cfg: Settings, landscape = true) {
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait" });
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(35, 48, 34);
  doc.rect(0, 0, w, 36, "F");
  doc.setTextColor(196, 219, 116);
  doc.setFontSize(11);
  doc.text("GETRÄNKESHOP ELIAS", 14, 12);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(title, 14, 27);
  doc.setFontSize(10);
  doc.text(id, w - 14, 27, { align: "right" });
  doc.setTextColor(40, 45, 35);
  const finish = () => {
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p);
      const h = doc.internal.pageSize.getHeight();
      doc.setTextColor(85, 96, 73);
      doc.setFontSize(8);
      doc.text(
        doc.splitTextToSize(
          `${cfg.business_name || "Getränkeshop Elias"} · ${cfg.business_address || ""}`,
          w - 60,
        ),
        14,
        h - 13,
      );
      doc.text(`${id} · ${p} / ${doc.getNumberOfPages()}`, w - 14, h - 8, {
        align: "right",
      });
    }
  };
  return { doc, finish };
}
const tableStyle = {
  fontSize: 8.5,
  cellPadding: 1.1,
  textColor: [40, 45, 35] as [number, number, number],
};
export function inventoryReport(
  run: InventoryRun,
  lines: InventoryLine[],
  events: InventoryEvent[],
) {
  const { doc, finish } = frame(
    "Wareninventur",
    number("INV", run.number),
    run.business_snapshot,
  );
  doc.setFontSize(10);
  const total = lines.reduce(
    (s, l) =>
      s +
      (inventoryValue(
        l.counted_units,
        l.product_snapshot.pack_count,
        l.cost_net_cents,
      ) ?? 0),
    0,
  );
  const missing = lines.filter(
    (l) =>
      l.counted_units !== null &&
      l.counted_units > 0 &&
      l.cost_net_cents === null,
  ).length;
  const info = [
    `${run.title} · ${run.location}`,
    `Zählbeginn: ${run.inventory_date} · ${status[run.status]}`,
    `Angelegt: ${date(run.created_at)} · ${run.created_name}`,
    run.applied_at
      ? `Freigegeben: ${date(run.applied_at)} · ${run.applied_name}`
      : "Freigabe durch den Inhaber: ausstehend",
    `${lines.filter((l) => l.counted_units !== null).length} / ${lines.length} Artikel gezählt · Warenwert netto ${missing ? "(Teilsumme) " : ""}${euro(total)}${missing ? ` · ${missing} Position(en) ohne Bewertung` : ""}`,
  ];
  const infoLines = info.flatMap((text) => doc.splitTextToSize(text, 268));
  doc.text(infoLines, 14, 45);
  let y = 45 + infoLines.length * 4.3 + 7;
  if (run.notes) {
    const notes = doc.splitTextToSize(`Vermerk: ${run.notes}`, 268);
    doc.setFontSize(9);
    doc.text(notes, 14, y);
    y += notes.length * 4 + 4;
  }
  doc.setFontSize(8);
  doc.text(
    "Mengen in einzelnen Flaschen / Dosen / Stück. EK = Netto-Einkaufswert je vollständigem Gebinde, ohne Pfand.",
    14,
    y,
  );
  y += 5;
  autoTable(doc, {
    startY: y,
    margin: { left: 14, right: 14, top: 15, bottom: 23 },
    head: [
      [
        "Artikel / Gebinde",
        "Soll bei Zählung",
        "Gezählt",
        "Differenz",
        "EK / Geb.",
        "Wert gezählt",
        "Bewegung danach",
        "Übernommen",
      ],
    ],
    body: lines.map((l) => {
      const p = l.product_snapshot;
      return [
        `${p.sku} · ${p.name}\n${p.pack_count} × ${(p.volume_ml / 1000).toLocaleString("de-DE")} l`,
        l.book_units ?? "Unbekannt",
        l.counted_units ?? "Offen",
        l.book_units === null || l.counted_units === null
          ? "-"
          : l.counted_units - l.book_units,
        money(l.cost_net_cents),
        l.counted_units === 0
          ? euro(0)
          : money(
              inventoryValue(l.counted_units, p.pack_count, l.cost_net_cents),
            ),
        l.movement_since_count ?? "-",
        l.applied_units ?? "-",
      ];
    }),
    rowPageBreak: "avoid",
    styles: tableStyle,
    headStyles: { fillColor: [45, 63, 38], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [247, 249, 240] },
    columnStyles: { 0: { cellWidth: 69 } },
  });
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Zählprotokoll & Differenzgründe", 14, 20);
  autoTable(doc, {
    startY: 28,
    margin: { left: 14, right: 14, top: 15, bottom: 23 },
    head: [
      ["Artikel", "Grund / Erläuterung", "Gezählt durch", "Zählzeitpunkt"],
    ],
    body: lines.map((l) => [
      `${l.product_snapshot.sku} · ${l.product_snapshot.name}`,
      `${reasonLabel(l.reason) || "Noch offen"}${l.note ? "\n" + l.note : ""}`,
      l.counted_name || "-",
      date(l.counted_at),
    ]),
    rowPageBreak: "avoid",
    styles: tableStyle,
    headStyles: { fillColor: [45, 63, 38], textColor: [255, 255, 255] },
    columnStyles: { 0: { cellWidth: 75 }, 1: { cellWidth: 90 } },
  });
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Verfahrens- und Freigabeprotokoll", 14, 20);
  const labels: Record<string, string> = {
    started: "Inventur angelegt",
    article_added: "Artikel ergänzt",
    counted: "Zählung gespeichert",
    submit: "Zur Prüfung eingereicht",
    reopen: "Erneut zur Zählung geöffnet",
    apply: "Bestand ausdrücklich übernommen",
    cancel: "Inventur abgebrochen",
  };
  autoTable(doc, {
    startY: 28,
    margin: { left: 14, right: 14, top: 15, bottom: 23 },
    head: [["Zeitpunkt", "Aktion", "Verantwortlich", "Position / Änderung"]],
    body: events
      .filter(
        (e) =>
          e.action !== "counted" ||
          Number((e.before_value as { revision?: number } | null)?.revision) >
            0,
      )
      .map((e) => [
        date(e.created_at),
        labels[e.action] || e.action,
        e.actor_name,
        (lines.find((l) => l.id === e.line_id)?.product_snapshot.sku || "-") +
          (inventoryEventDetail(e) ? "\n" + inventoryEventDetail(e) : ""),
      ]),
    rowPageBreak: "avoid",
    styles: tableStyle,
    headStyles: { fillColor: [45, 63, 38], textColor: [255, 255, 255] },
  });
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Bewertung & Aufbewahrung", 14, 20);
  doc.setFontSize(10);
  const notes = [
    "Dieser Bericht dokumentiert die Wareninventur am erfassten Lagerort. Die Zählzeitpunkte jeder Position sind Bestandteil des Berichts. Bei einer mehrtägigen Zählung gibt das Datum auf dem Deckblatt den Beginn an.",
    "Sollbestand und Differenz beziehen sich auf den gespeicherten Zählzeitpunkt der jeweiligen Position. Bekannte Warenbewegungen danach werden bei der Freigabe hinzugerechnet bzw. abgezogen. Bei unbekanntem Erstbestand ist nach einer Warenbewegung eine erneute Zählung erforderlich.",
    "Der Warenwert ergibt sich aus gezählten Einzelmengen und dem erfassten Netto-Einkaufswert je Gebinde, anteilig auf Cent gerundet. Nullbestand hat den Wert 0,00 EUR. Fehlende Werte werden nicht durch Verkaufspreise ersetzt. Wertberichtigungen sind mit Begründung zu dokumentieren; die steuerliche Bewertung ist durch den Inhaber mit der Buchhaltung abzustimmen.",
    "Pfand, sonstige Vermögensgegenstände, Forderungen und Schulden sind nicht Teil dieses Warenwerts. Dieser Bericht ersetzt daher kein vollständiges Inventar oder einen Jahresabschluss. Bei unterschiedlichen Zähltagen bzw. abweichendem Abschlussstichtag ist eine gesonderte Fortschreibung erforderlich.",
    "Abgeschlossene Inventuren und Korrekturbelege sind in der Anwendung gegen Überschreiben geschützt. Inventare sind grundsätzlich zehn Jahre aufzubewahren (§ 257 HGB); maßgebliche Fristen und etwaige Verlängerungen sind mit der Buchhaltung zu prüfen. PDF, CSV und die zugehörigen Daten einschließlich Änderungsprotokoll müssen geordnet gesichert und wiederherstellbar bleiben.",
    "Grundlagen: § 240 HGB (Inventar), § 253 HGB (Bewertung), § 257 HGB (Aufbewahrung). Die tatsächliche Vollständigkeit der Aufnahme und Richtigkeit der Werte bestätigt der Inhaber mit der Freigabe.",
  ];
  let yy = 32;
  for (const note of notes) {
    const txt = doc.splitTextToSize(note, 264);
    doc.text(txt, 14, yy);
    yy += txt.length * 4.8 + 7;
  }
  finish();
  return doc.output("arraybuffer");
}
export function adjustmentReport(a: StockAdjustment) {
  const { doc, finish } = frame(
    "Bestandskorrektur",
    number("BK", a.number),
    a.business_snapshot,
    false,
  );
  const p = a.product_snapshot;
  autoTable(doc, {
    startY: 46,
    margin: { left: 14, right: 14, bottom: 25 },
    body: [
      ["Artikel", `${p.sku} · ${p.name}`],
      [
        "Gebinde",
        `${p.pack_count} × ${(p.volume_ml / 1000).toLocaleString("de-DE")} l`,
      ],
      ["Ereignisdatum", a.occurred_on],
      ["Gebucht am / durch", `${date(a.created_at)} · ${a.actor_name}`],
      ["Grund", reasonLabel(a.reason)],
      ["Begründung", a.note],
      ["Referenz / Nachweis", a.reference || "-"],
      ["Soll vorher (Einzelstücke)", a.before_units],
      ["Veränderung (Einzelstücke)", a.delta_units],
      ["Bestand danach (Einzelstücke)", a.after_units],
      [
        "Warenwert der Veränderung (netto)",
        money(
          inventoryValue(a.delta_units, p.pack_count, p.cost_net_cents ?? null),
        ),
      ],
      ...(a.reverses_id ? [["Gegenbuchung zu Beleg-ID", a.reverses_id]] : []),
    ],
    styles: { ...tableStyle, fontSize: 10, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 64, fontStyle: "bold" } },
    alternateRowStyles: { fillColor: [247, 249, 240] },
  });
  let y =
    (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;
  if (y > 235) {
    doc.addPage();
    y = 22;
  }
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(
      "Mengen werden in Einzelstücken geführt; vollständige Gebinde und Restmengen werden automatisch umgerechnet. Dieser Beleg dokumentiert die Warenbewegung, keine Umsatzsteuerbuchung. Pfand sowie die steuerliche Behandlung von Geschenken, Privatentnahmen und Proben sind gesondert zu prüfen. Fehler werden durch eine zugeordnete Gegenbuchung berichtigt; der ursprüngliche Beleg bleibt erhalten.",
      180,
    ),
    14,
    y,
  );
  finish();
  return doc.output("arraybuffer");
}
const cell = (v: unknown) =>
  '"' +
  (typeof v === "string"
    ? v.replace(/^[=+@-]/, "'$&")
    : String(v ?? "")
  ).replaceAll('"', '""') +
  '"';
export function inventoryCsv(run: InventoryRun, lines: InventoryLine[]) {
  const header = [
    "Inventurnummer",
    "Status",
    "Zählbeginn",
    "Lagerort",
    "SKU",
    "Artikel",
    "Einheiten je Gebinde",
    "Volumen ml",
    "Soll Einzelstücke",
    "Gezählt Einzelstücke",
    "Differenz Einzelstücke",
    "Netto EK Gebinde Cent",
    "Netto Warenwert Cent",
    "Grund",
    "Notiz",
    "Gezählt am",
    "Gezählt durch",
    "Bewegung nach Zählung",
    "Übernommen Einzelstücke",
    "Freigegeben am",
    "Freigegeben durch",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...lines.map((l) => [
        number("INV", run.number),
        status[run.status],
        run.inventory_date,
        run.location,
        l.product_snapshot.sku,
        l.product_snapshot.name,
        l.product_snapshot.pack_count,
        l.product_snapshot.volume_ml,
        l.book_units,
        l.counted_units,
        l.book_units === null || l.counted_units === null
          ? ""
          : l.counted_units - l.book_units,
        l.cost_net_cents,
        l.counted_units === 0
          ? 0
          : inventoryValue(
              l.counted_units,
              l.product_snapshot.pack_count,
              l.cost_net_cents,
            ),
        reasonLabel(l.reason),
        l.note,
        l.counted_at,
        l.counted_name,
        l.movement_since_count,
        l.applied_units,
        run.applied_at,
        run.applied_name,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
