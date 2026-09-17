export type EpsonConfig = {
  printer_address: string;
  printer_device_id?: string;
  printer_width_dots?: 512 | 576;
  printer_model?: string;
};
export function printerOrigin(address: string) {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error(
      "Bitte eine vollständige HTTPS-Adresse des Druckers eingeben.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error(
      "Nur HTTPS-Druckeradresse ohne Zugangsdaten, Pfad oder Parameter verwenden.",
    );
  return url.origin;
}
export function printerEndpoint(config: EpsonConfig) {
  const device = config.printer_device_id || "local_printer";
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(device))
    throw new Error("Ungültige ePOS-Gerätekennung.");
  return `${printerOrigin(config.printer_address)}/cgi-bin/epos/service.cgi?devid=${encodeURIComponent(device)}&timeout=60000`;
}
export function printerFingerprint(config: EpsonConfig) {
  return `${printerOrigin(config.printer_address)}|${config.printer_device_id || "local_printer"}|${config.printer_width_dots || 576}`;
}
export function soapPrint(content: string) {
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">${content}</epos-print></s:Body></s:Envelope>`;
}
// Ordered dithering preserves the pale green bottles in the original logo.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Epson monochrome raster: row-major, MSB first, 1=black; alpha is composited on white.
export function monochromeRaster(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    !Number.isInteger(height) ||
    height < 1 ||
    rgba.length !== width * height * 4
  )
    throw new Error("Ungültiges Druckbild.");
  const stride = Math.ceil(width / 8),
    bytes = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        alpha = rgba[i + 3] / 255;
      const gray =
        (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha +
        255 * (1 - alpha);
      if (gray < ((BAYER[(y % 4) * 4 + (x % 4)] + 0.5) * 255) / 16)
        bytes[y * stride + (x >> 3)] |= 0x80 >> (x % 8);
    }
  return bytes;
}
export class EpsonError extends Error {
  constructor(
    message: string,
    public outcome: "failed" | "unknown" = "unknown",
  ) {
    super(message);
  }
}
export function epsonStatus(
  success: string | null,
  code: string | null,
  raw: string | null,
) {
  if (raw === null || !/^\d+$/.test(raw))
    throw new EpsonError("Keine gültige Epson-Statusantwort. Drucker prüfen.");
  const status = Number(raw) >>> 0;
  if (code === "JobSpooling")
    throw new EpsonError(
      "Druckauftrag nur zwischengespeichert. Spooler in Web Config ausschalten; Ausdruck am Gerät prüfen.",
    );
  const problem =
    status & 0x80000
      ? "Papier fehlt"
      : status & 0x20
        ? "Druckerabdeckung offen"
        : status & 0x8
          ? "Drucker offline"
          : status & 0x6c00
            ? "Drucker meldet einen Gerätefehler"
            : status & 1
              ? "Drucker antwortet nicht"
              : "";
  if (!["true", "1"].includes(success || "") || problem || code)
    throw new EpsonError(
      `${problem || "Epson meldet einen Druckfehler"}${code ? ` (${code})` : ""}. Eventuell bereits gedrucktes Papier prüfen.`,
      "unknown",
    );
  return { nearEnd: !!(status & 0x20000) };
}
