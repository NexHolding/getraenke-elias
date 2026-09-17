import type { jsPDF } from "jspdf";
import type { Sale, ReceiptIssuer } from "./types";
import { euro, totals } from "./money";
import { discountTotal } from "./discounts";
import { receiptLogo } from "./receipt-logo";

const WIDTH = 80,
  LEFT = 5,
  RIGHT = 75,
  CONTENT = RIGHT - LEFT;
// Historical receipts had these fixed issuer details. Never retrofit today's settings.
const legacyIssuer: ReceiptIssuer = {
  business_name: "Getränkeshop Elias · Frank Elias",
  business_address: "Wartbergstraße 3 · 74076 Heilbronn",
  tax_number: "",
  vat_id: "",
  register_id: "",
  website: "getraenke-elias.de",
};
const dateTime = (date: string) =>
  new Date(date).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
const clean = (text: string) =>
  text
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ");
type Block = { height: number; draw: (doc: jsPDF, y: number) => void };

export async function createReceiptPdf(sale: Sale) {
  const { jsPDF } = await import("jspdf");
  const issuer = sale.issuer_snapshot || legacyIssuer;
  const fiscal = sale.fiscal;
  const total = totals(sale.items);
  if (
    total.gross !== sale.total_cents ||
    total.net !== sale.net_cents ||
    total.tax !== sale.tax_cents ||
    total.deposit !== sale.deposit_cents
  )
    throw new Error(
      "Belegsumme stimmt nicht mit den gespeicherten Positionen überein.",
    );
  if (
    !sale.test_mode &&
    ((!issuer.tax_number && !issuer.vat_id) ||
      !fiscal ||
      [
        fiscal.transaction_number,
        fiscal.started_at,
        fiscal.finished_at,
        fiscal.register_serial,
        fiscal.tse_serial,
        fiscal.signature,
        fiscal.signature_counter,
      ].some((v) => !v))
  )
    throw new Error(
      "Fiskalisierter Bon kann ohne vollständige Steuer- und TSE-Daten nicht ausgegeben werden.",
    );
  const measure = new jsPDF({ unit: "mm", format: [WIDTH, 200] });
  const blocks: Block[] = [];
  const gap = (height: number) => blocks.push({ height, draw: () => {} });
  const text = (value: string, size = 8, bold = false, center = false) => {
    measure.setFont("helvetica", bold ? "bold" : "normal");
    measure.setFontSize(size);
    const lines: string[] = measure.splitTextToSize(clean(value), CONTENT);
    const leading = size * 0.45;
    blocks.push({
      height: lines.length * leading + 1,
      draw: (doc, y) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.text(lines, center ? WIDTH / 2 : LEFT, y + size * 0.35, {
          align: center ? "center" : "left",
          lineHeightFactor: 1.28,
        });
      },
    });
  };
  const pair = (label: string, value: string, size = 8, bold = false) => {
    measure.setFont("helvetica", bold ? "bold" : "normal");
    measure.setFontSize(size);
    if (
      measure.getTextWidth(clean(label)) +
        measure.getTextWidth(clean(value)) +
        3 >
      CONTENT
    ) {
      text(label, size, bold);
      text(value, size, bold);
      return;
    }
    blocks.push({
      height: size * 0.48 + 1,
      draw: (doc, y) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        doc.text(clean(label), LEFT, y + size * 0.35);
        doc.text(clean(value), RIGHT, y + size * 0.35, { align: "right" });
      },
    });
  };
  const rule = () =>
    blocks.push({
      height: 5,
      draw: (doc, y) => {
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        doc.line(LEFT, y + 2, RIGHT, y + 2);
      },
    });
  const logo = measure.getImageProperties(receiptLogo);
  const logoWidth = 52,
    logoHeight = (logoWidth * logo.height) / logo.width;
  blocks.push({
    height: logoHeight + 4,
    draw: (doc, y) =>
      doc.addImage(
        receiptLogo,
        "PNG",
        (WIDTH - logoWidth) / 2,
        y,
        logoWidth,
        logoHeight,
      ),
  });
  text(issuer.business_name, 8.5, true, true);
  for (const line of issuer.business_address.split(/[·\n]/).filter(Boolean))
    text(line.trim(), 8, false, true);
  if (issuer.tax_number)
    text(`Steuernummer: ${issuer.tax_number}`, 7.5, false, true);
  if (issuer.vat_id) text(`USt-IdNr.: ${issuer.vat_id}`, 7.5, false, true);
  rule();
  text(sale.test_mode ? "EINRICHTUNGSBELEG" : "KASSENBELEG", 10, true, true);
  text(`Bon E-${String(sale.number).padStart(6, "0")}`, 9, true, true);
  if (sale.test_mode)
    text("Nicht fiskalisiert - kein steuerlicher Echtbetrieb", 7, false, true);
  gap(2);
  pair("Belegdatum", dateTime(sale.created_at), 7.5);
  pair(
    "Leistungsdatum",
    new Date(sale.created_at).toLocaleDateString("de-DE", {
      timeZone: "Europe/Berlin",
    }),
    7.5,
  );
  if (issuer.register_id) pair("Kasse", issuer.register_id, 7.5);
  if (sale.actor_name)
    pair(
      "Bedienung",
      /global_admin/i.test(sale.actor_name)
        ? "Administration"
        : sale.actor_name,
      7.5,
    );
  rule();
  pair("ARTIKEL / MENGE", "EUR", 7.5, true);
  const rates = Object.keys(total.taxes)
    .map(Number)
    .sort((a, b) => b - a);
  const code = (rate: number) => String.fromCharCode(65 + rates.indexOf(rate));
  for (const line of sale.items) {
    const itemStart = blocks.length;
    text(line.name, 8.5, true);
    if (line.price_cents || line.quantity > 0)
      pair(
        `${line.quantity} x ${euro(line.price_cents)}`,
        `${euro(line.quantity * line.price_cents)} ${code(line.tax_rate)}`,
      );
    const saving = discountTotal([line]);
    if (saving) {
      pair(
        "Warenwert vor Rabatt",
        euro(line.quantity * (line.original_price_cents ?? line.price_cents)),
        7,
      );
      pair(
        `${line.discount_scope === "cart" ? "Warenkorbrabatt" : line.discount_scope === "item" ? "Artikelrabatt" : "Rabatt"} ${line.discount_percent ?? ""} %`,
        `-${euro(saving)}`,
        7,
      );
      if (line.discount_reason) text(`Grund: ${line.discount_reason}`, 7);
    }
    if (line.deposit_cents)
      pair(
        `${line.quantity} x ${euro(line.deposit_cents)} Pfand`,
        `${euro(line.quantity * line.deposit_cents)} ${code(line.deposit_tax_rate)}`,
        7.5,
      );
    gap(2);
    const itemBlocks = blocks.splice(itemStart);
    blocks.push({
      height: itemBlocks.reduce((sum, b) => sum + b.height, 0),
      draw: (doc, y) => {
        for (const block of itemBlocks) {
          block.draw(doc, y);
          y += block.height;
        }
      },
    });
  }
  rule();
  pair(
    total.gross < 0 ? "AUSZAHLUNG" : "GESAMT",
    euro(Math.abs(total.gross)),
    13,
    true,
  );
  pair("Zahlart", sale.payment === "cash" ? "Bar" : "Karte", 9, true);
  if (sale.payment === "card")
    text(
      "Zahlart erfasst. Terminalbeleg separat; keine Zahlungsautorisierung durch diesen Bon.",
      7,
    );
  pair("Pfand enthalten", euro(total.deposit), 7.5);
  const savings = discountTotal(sale.items);
  if (savings) {
    pair("Rabatt bereits enthalten", `-${euro(savings)}`, 7.5);
    text("Pfand ist vom Rabatt ausgenommen.", 7);
  }
  rule();
  text("UMSATZSTEUER - IM BRUTTO ENTHALTEN", 7.5, true);
  const taxRow = (values: string[], bold = false) =>
    blocks.push({
      height: 5,
      draw: (doc, y) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(7);
        values.forEach((v, i) =>
          doc.text(clean(v), [LEFT, 35, 53, RIGHT][i], y + 2.5, {
            align: i ? "right" : "left",
          }),
        );
      },
    });
  taxRow(["Satz", "Netto", "USt.", "Brutto"], true);
  const decimal = (c: number) =>
    new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(c / 100);
  for (const rate of rates) {
    const t = total.taxes[rate];
    taxRow([
      `${code(rate)} ${rate} %`,
      decimal(t.net),
      decimal(t.tax),
      decimal(t.gross),
    ]);
  }
  pair("Netto gesamt", euro(total.net), 7.5);
  pair("Umsatzsteuer gesamt", euro(total.tax), 7.5);
  if (fiscal && !sale.test_mode) {
    rule();
    text("FISKALDATEN", 7.5, true);
    text(`Transaktion: ${fiscal.transaction_number}`, 7);
    text(`Beginn: ${dateTime(fiscal.started_at)}`, 7);
    text(`Ende: ${dateTime(fiscal.finished_at)}`, 7);
    text(`Kassen-Seriennummer: ${fiscal.register_serial}`, 7);
    text(`TSE-Seriennummer: ${fiscal.tse_serial}`, 7);
    text(`Signaturzähler: ${fiscal.signature_counter}`, 7);
    text(`Prüfwert: ${fiscal.signature}`, 7);
  }
  if (sale.test_mode) {
    rule();
    text(
      "Einrichtungsmodus: keine TSE-Signatur und keine Terminalbestätigung.",
      7,
    );
    if (!issuer.tax_number && !issuer.vat_id)
      text("Steuernummer / USt-IdNr. noch nicht hinterlegt.", 7);
    if (!sale.issuer_snapshot)
      text(
        "Altbeleg: Betriebsdaten wurden damals nicht als Datensatz gespeichert.",
        7,
      );
  }
  if (total.gross > 25000)
    text(
      "Für eine vollständige Rechnung mit Empfängerangaben bitte an den Inhaber wenden.",
      7,
    );
  rule();
  text("Vielen Dank für deinen Einkauf!", 9, true, true);
  if (issuer.website)
    text(issuer.website.replace(/^https?:\/\//, ""), 8, false, true);
  // Content-sized 80-mm pages; long receipts continue without oversized blank areas.
  const pages: Block[][] = [[]];
  let used = 0;
  for (const block of blocks) {
    if (used + block.height > 320 && pages.at(-1)!.length) {
      pages.push([]);
      used = 0;
    }
    pages.at(-1)!.push(block);
    used += block.height;
  }
  const heights = pages.map((p, i) =>
    Math.max(100, p.reduce((sum, b) => sum + b.height, 0) + 16 + (i ? 10 : 0)),
  );
  const doc = new jsPDF({
    unit: "mm",
    format: [WIDTH, heights[0]],
    compress: true,
  });
  doc.setProperties({
    title: `Elias Bon E-${String(sale.number).padStart(6, "0")}`,
    author: issuer.business_name,
    creator: "Getränke Elias",
  });
  doc.viewerPreferences({ PrintScaling: "None" });
  pages.forEach((page, index) => {
    if (index) doc.addPage([WIDTH, heights[index]]);
    doc.setTextColor(0);
    let y = 5;
    if (index) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(
        `ELIAS - Bon E-${String(sale.number).padStart(6, "0")} - Fortsetzung`,
        LEFT,
        y + 3,
      );
      y += 10;
    }
    for (const b of page) {
      b.draw(doc, y);
      y += b.height;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`${index + 1} / ${pages.length}`, RIGHT, heights[index] - 4, {
      align: "right",
    });
  });
  return doc;
}
