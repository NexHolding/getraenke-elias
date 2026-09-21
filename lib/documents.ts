import { deliveryAmount } from "./delivery-totals";
import { paymentLabels } from "./billing";
import { receiptLogo } from "./receipt-logo";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { euro, totals, pack } from "./money";
import {
  normalizeIban,
  paymentAccountIssue,
  paymentQrPayload,
} from "./payment-qr";
import type { Delivery, Invoice, Order, Settings } from "./types";

const ink: [number, number, number] = [40, 55, 39];
const muted: [number, number, number] = [102, 113, 99];
const pale: [number, number, number] = [244, 247, 239];
const date = (value: string) =>
  new Date(
    value.length === 10 ? value + "T12:00:00Z" : value,
  ).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
export const businessDocumentFilename = (
  kind: "invoice" | "delivery",
  number: number,
) =>
  `Elias-${kind === "invoice" ? "RE" : "LS"}-${String(number).padStart(6, "0")}.pdf`;
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
  // Issuer and bank account are the facts at issue time, never today's mutable settings.
  if (snapshot.business_snapshot?.business_name)
    cfg = snapshot.business_snapshot;
  const invoice = kind === "invoice" ? (record as Invoice) : null;
  const delivery = kind === "delivery" ? (record as Delivery) : null;
  const t = invoice ? totals(invoice.items) : null;
  if (
    invoice &&
    t &&
    (t.gross !== invoice.total_cents ||
      t.net !== invoice.net_cents ||
      t.tax !== invoice.tax_cents)
  )
    throw Error(
      "Rechnungsbeträge und Steueraufteilung stimmen nicht überein. Bitte Beleg prüfen.",
    );
  const setup = record.mode !== "live";
  if (
    invoice &&
    !setup &&
    (!cfg.business_name?.trim() ||
      !cfg.business_address?.trim() ||
      (!cfg.tax_number?.trim() && !/^DE[0-9]{9}$/.test(cfg.vat_id || "")))
  )
    throw Error(
      "Rechnungsaussteller, Geschäftsanschrift und bestätigte Steuernummer oder USt-IdNr. müssen hinterlegt sein.",
    );
  const article = (line: {
    name: string;
    pack_count?: number;
    volume_ml?: number;
  }) =>
    line.pack_count && line.volume_ml
      ? `${line.name} · ${pack({ pack_count: line.pack_count, volume_ml: line.volume_ml })}`
      : line.pack_count && line.pack_count > 1
        ? `${line.name} · Gebinde à ${line.pack_count}`
        : line.name;
  const number = `${invoice ? "RE" : "LS"}-${String(record.number).padStart(6, "0")}`;
  const title = invoice ? "Rechnung" : "Lieferschein";
  const doc = new jsPDF();
  doc.setProperties({
    title: `${title} ${number}`,
    author: cfg.business_name || "Getränke Elias",
    subject: setup ? "Einrichtungsbeleg - nicht bezahlen" : title,
  });
  const text = (
    value: string,
    x: number,
    y: number,
    size = 9,
    bold = false,
    color = ink,
    align: "left" | "right" = "left",
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(value, x, y, { align });
  };
  const wrapped = (value: string, width: number, size = 9): string[] => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(
      value.replace(/[\r\t]/g, " "),
      width,
    ) as string[];
  };
  const footerLeft = [
    ...wrapped(cfg.business_name || "Getränke Elias", 103, 7.5),
    ...wrapped(cfg.business_address || "Anschrift nicht hinterlegt", 103, 7.5),
  ];
  const footerRight = [
    ...(cfg.tax_number
      ? wrapped(`Steuernummer: ${cfg.tax_number}`, 67, 7.5)
      : []),
    ...(cfg.vat_id ? wrapped(`USt-IdNr.: ${cfg.vat_id}`, 67, 7.5) : []),
  ];
  if (!footerRight.length) footerRight.push("Steuerangaben nicht hinterlegt");
  const footerTop =
    288 - Math.max(footerLeft.length, footerRight.length + 1) * 3.8;
  const bottom = Math.min(263, footerTop - 8);
  const header = (continuation = false) => {
    doc.setFillColor(163, 185, 60);
    doc.rect(16, 14, 2, 21, "F");
    text("GETRÄNKE ELIAS", 23, 19, 8, true, muted);
    text(title, 23, 30, 25, true);
    const logo = doc.getImageProperties(receiptLogo);
    doc.addImage(
      receiptLogo,
      "PNG",
      152,
      13,
      42,
      (42 * logo.height) / logo.width,
    );
    doc.setDrawColor(222, 229, 214);
    doc.line(16, 41, 194, 41);
    if (continuation)
      text(`${number}  /  Fortsetzung`, 16, 48, 8, false, muted);
  };
  header();
  const recipient = invoice?.customer_snapshot || {
    name: order.customer_name,
    address: order.address,
  };
  text(invoice ? "RECHNUNG AN" : "LIEFERUNG AN", 16, 51, 7, true, muted);
  let recipientY = 58;
  for (const line of wrapped(recipient.name, 98, 11)) {
    text(line, 16, recipientY, 11, true);
    recipientY += 5;
  }
  for (const line of wrapped(
    recipient.address.replace(/\s*[·,]\s*/g, "\n"),
    98,
  )) {
    text(line, 16, recipientY);
    recipientY += 4.5;
  }
  const metadata: [string, string][] = [
    ["Belegnummer", number],
    [
      invoice
        ? "Rechnungsdatum"
        : delivery?.status === "draft"
          ? "Entwurfsdatum"
          : "Lieferdatum",
      date(delivery?.delivered_at || record.created_at),
    ],
    ["Auftrag", `EL-${String(order.number).padStart(5, "0")}`],
  ];
  if (invoice) {
    metadata.push([
      "Liefer-/Leistungsdatum",
      invoice.service_date
        ? date(invoice.service_date)
        : "Siehe zugehörigen Lieferschein",
    ]);
    if (invoice.delivery_number)
      metadata.push([
        "Lieferschein",
        `LS-${String(invoice.delivery_number).padStart(6, "0")}`,
      ]);
  }
  let metaY = 52;
  for (const [label, value] of metadata) {
    text(label, 117, metaY, 7, false, muted);
    for (const line of wrapped(value, 42, 8.5)) {
      text(line, 194, metaY, 8.5, true, ink, "right");
      metaY += 4;
    }
    metaY += 2;
  }
  let y = Math.max(recipientY + 8, metaY + 3);
  const table = (
    head: string[],
    body: (string | number)[][],
    widths?: number[],
  ) => {
    autoTable(doc, {
      startY: y,
      margin: { left: 16, right: 16, top: 55, bottom: 297 - bottom },
      head: [head],
      body,
      theme: "plain",
      rowPageBreak: "avoid",
      styles: {
        font: "helvetica",
        fontSize: 8.3,
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        textColor: ink,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: pale,
        textColor: ink,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      bodyStyles: { lineColor: [232, 236, 226], lineWidth: { bottom: 0.15 } },
      columnStyles: Object.fromEntries(
        head.map((_, i) => [
          i,
          {
            ...(widths ? { cellWidth: widths[i] } : {}),
            halign: i > 0 ? "right" : "left",
          },
        ]),
      ),
    });
    y =
      (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 8;
  };
  const room = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = 57;
    }
  };
  if (invoice && t) {
    const rows: (string | number)[][] = [];
    invoice.items.forEach((line, index) => {
      if (line.price_cents !== 0 || line.quantity >= 0)
        rows.push([
          `${index + 1}.  ${article(line)}`,
          line.quantity,
          euro(line.price_cents),
          `${line.tax_rate} %`,
          euro(line.quantity * line.price_cents),
        ]);
      if (line.deposit_cents)
        rows.push([
          `${line.quantity < 0 ? "Pfandrücknahme" : "Pfand"}${line.quantity < 0 ? "" : ` zu Position ${index + 1}`}`,
          line.quantity,
          euro(line.deposit_cents),
          `${line.deposit_tax_rate} %`,
          euro(line.quantity * line.deposit_cents),
        ]);
    });
    table(
      ["Artikel / Leistung", "Menge", "Einzel brutto", "USt.", "Gesamt brutto"],
      rows,
      [86, 15, 29, 18, 30],
    );
    const groups = Object.entries(t.taxes).filter(
      ([, group]) => group.gross !== 0 || group.net !== 0 || group.tax !== 0,
    );
    room(28 + groups.length * 9);
    table(
      ["Steueraufteilung inkl. Pfand", "Netto", "Umsatzsteuer", "Brutto"],
      groups.map(([rate, group]) => [
        `${rate} % USt.`,
        euro(group.net),
        euro(group.tax),
        euro(group.gross),
      ]),
      [71, 34, 39, 34],
    );
    room(23);
    doc.setFillColor(...pale);
    doc.roundedRect(16, y - 2, 178, 18, 2, 2, "F");
    text(
      invoice.total_cents < 0
        ? "Guthaben inkl. Pfand"
        : "Rechnungsbetrag inkl. Pfand",
      21,
      y + 9,
      10,
      true,
    );
    text(euro(invoice.total_cents), 189, y + 10, 19, true, ink, "right");
    y += 24;
    const reference = `Rechnung ${number}`;
    const canPay =
      !setup && invoice.status !== "paid" && invoice.total_cents > 0;
    const accountReady = !paymentAccountIssue(cfg);
    if (canPay && accountReady) {
      const bankLines = [
        ...wrapped(cfg.bank_account_holder!, 121, 9),
        ...wrapped(
          `IBAN  ${normalizeIban(cfg.bank_iban!)
            .replace(/(.{4})/g, "$1 ")
            .trim()}`,
          121,
          9,
        ),
        ...(cfg.bank_bic ? [`BIC  ${cfg.bank_bic}`] : []),
        ...(cfg.bank_name ? wrapped(cfg.bank_name, 121, 8) : []),
        reference,
        `Überweisungsbetrag: ${euro(invoice.total_cents)}`,
      ];
      const h = Math.max(56, bankLines.length * 4.5 + 23);
      room(h);
      text(
        invoice.due_date
          ? `Zahlbar bis ${date(invoice.due_date)}`
          : "Zahlung per Überweisung",
        16,
        y,
        10,
        true,
      );
      bankLines.forEach((line, i) => text(line, 16, y + 8 + i * 4.5, 9));
      const qr = QRCode.create(
        paymentQrPayload(cfg, invoice.total_cents, reference),
        { errorCorrectionLevel: "M" },
      );
      if (qr.version > 13)
        throw Error("SEPA-QR überschreitet die zulässige Größe.");
      const size = 37,
        cell = size / (qr.modules.size + 8),
        x = 157,
        top = y + 2;
      doc.setFillColor(255, 255, 255);
      doc.rect(x, top, size, size, "F");
      doc.setFillColor(0, 0, 0);
      for (let r = 0; r < qr.modules.size; r++)
        for (let c = 0; c < qr.modules.size; c++)
          if (qr.modules.get(r, c))
            doc.rect(x + (c + 4) * cell, top + (r + 4) * cell, cell, cell, "F");
      text(
        "Mit Banking-App scannen",
        194,
        top + size + 4,
        7,
        false,
        muted,
        "right",
      );
      text(
        "Bitte nur überweisen, sofern noch offen. Bereits gezahlte Beträge nicht erneut bezahlen.",
        16,
        y + h - 4,
        7.5,
        false,
        muted,
      );
      y += h;
    } else {
      const message = setup
        ? "Einrichtungsbeleg - nicht bezahlen. Kein steuerlicher Echtbeleg."
        : invoice.status === "paid"
          ? `${invoice.total_cents < 0 ? "Pfandguthaben ausgezahlt" : invoice.total_cents === 0 ? "Vollständig verrechnet" : "Zahlung erhalten"} · ${paymentLabels[invoice.payment_method || "invoice"]}`
          : `${invoice.due_date ? `Zahlbar bis ${date(invoice.due_date)}. ` : ""}Bankverbindung bitte beim Aussteller erfragen.`;
      const lines = wrapped(message, 178);
      room(lines.length * 4.5 + 4);
      lines.forEach((line, i) => text(line, 16, y + i * 4.5, 9, true));
      y += lines.length * 4.5 + 4;
    }
  } else if (delivery) {
    table(
      ["Artikel", "Bestellt", "Geliefert", "Noch offen"],
      order.items.map((line) => {
        const qty =
          delivery.items.find((item) => item.id === line.id)?.quantity || 0;
        const delivered = order.delivered?.[line.id] || 0;
        return [
          article(line),
          line.quantity,
          qty,
          Math.max(
            0,
            line.quantity - delivered - (delivery.status === "draft" ? qty : 0),
          ),
        ];
      }),
      [103, 25, 25, 25],
    );
    if (delivery.deposit_returns?.length) {
      room(23);
      table(
        ["Zurückgenommenes Leergut", "Menge", "Pfand / Einheit", "Verrechnung"],
        delivery.deposit_returns.map((line) => [
          "Pfandrücknahme",
          -line.quantity,
          euro(line.deposit_cents),
          euro(line.quantity * line.deposit_cents),
        ]),
        [91, 20, 34, 33],
      );
    }
    room(72);
    const amount = deliveryAmount(delivery);
    doc.setFillColor(...pale);
    doc.roundedRect(16, y - 2, 178, 18, 2, 2, "F");
    text(
      amount < 0
        ? "Pfandguthaben / Auszahlung"
        : "Zahlbetrag nach Pfandrücknahme",
      21,
      y + 9,
      10,
      true,
    );
    text(euro(Math.abs(amount)), 189, y + 10, 18, true, ink, "right");
    y += 24;
    text(
      `Zahlungsart: ${delivery.payment_method ? paymentLabels[delivery.payment_method] : "Noch nicht festgelegt"} · Dieser Lieferschein ist keine Rechnung.`,
      16,
      y,
      8,
      false,
      muted,
    );
    y += 8;
    text(
      delivery.status === "draft"
        ? "ÜBERGABE NOCH NICHT BESTÄTIGT"
        : "EMPFANGSBESTÄTIGUNG",
      16,
      y,
      8,
      true,
      muted,
    );
    y += 6;
    const nameLines = wrapped(
      `Empfangen von: ${delivery.signed_name || "Noch nicht bestätigt"}`,
      100,
    );
    nameLines.forEach((line, i) => text(line, 16, y + i * 4.5));
    y += nameLines.length * 4.5;
    if (delivery.delivered_at)
      text(
        `Übergabe am ${date(delivery.delivered_at)} · ${new Date(delivery.delivered_at).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`,
        16,
        y + 2,
        8,
        false,
        muted,
      );
    if (delivery.signature) {
      try {
        doc.addImage(delivery.signature, "PNG", 127, y - 10, 62, 23);
      } catch {
        text("Signatur nicht darstellbar", 127, y, 8);
      }
      doc.setDrawColor(210, 218, 201);
      doc.line(125, y + 15, 194, y + 15);
      text("Unterschrift des Empfängers", 125, y + 20, 7, false, muted);
    }
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    if (page > 1) header(true);
    doc.setDrawColor(222, 229, 214);
    doc.line(16, footerTop - 4, 194, footerTop - 4);
    footerLeft.forEach((line, i) =>
      text(line, 16, footerTop + i * 3.8, 7.5, false, muted),
    );
    footerRight.forEach((line, i) =>
      text(line, 194, footerTop + i * 3.8, 7.5, false, muted, "right"),
    );
    text(
      `${number}  ·  Seite ${page} von ${doc.getNumberOfPages()}`,
      194,
      290,
      7,
      false,
      muted,
      "right",
    );
    if (setup || delivery?.status === "draft")
      text(
        delivery?.status === "draft"
          ? "ENTWURF - keine Empfangsbestätigung"
          : "EINRICHTUNGSBELEG - kein steuerlicher Echtbeleg",
        16,
        290,
        7,
        true,
        muted,
      );
  }
  return {
    bytes: Buffer.from(doc.output("arraybuffer")),
    filename: businessDocumentFilename(kind, record.number),
  };
}
