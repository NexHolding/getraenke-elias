import {
  EpsonError,
  epsonStatus,
  monochromeRaster,
  printerEndpoint,
  printerFingerprint,
  soapPrint,
  type EpsonConfig,
} from "./epson";
export function printerVerified(config: EpsonConfig) {
  try {
    return (
      localStorage.getItem("elias-epson-verified") ===
      printerFingerprint(config)
    );
  } catch {
    return false;
  }
}
export function verifyPrinter(config: EpsonConfig) {
  localStorage.setItem("elias-epson-verified", printerFingerprint(config));
}
async function send(config: EpsonConfig, content: string) {
  const url = printerEndpoint(config);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
      body: soapPrint(content),
      signal: AbortSignal.timeout(75000),
    });
  } catch {
    throw new EpsonError(
      "Keine bestätigte Druckerantwort. Netzwerk, HTTPS-Zertifikat und lokalen Netzwerkzugriff prüfen. Ein Ausdruck kann trotzdem erfolgt sein; nicht ungeprüft wiederholen.",
    );
  }
  if (!response.ok)
    throw new EpsonError(
      `Drucker antwortet mit HTTP ${response.status}. Ausdruck am Gerät prüfen.`,
    );
  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new EpsonError(
      "Druckerantwort unterbrochen. Der Bon kann bereits gedruckt sein; Gerät prüfen.",
    );
  }
  const xml = new DOMParser().parseFromString(body, "application/xml");
  const result = xml.getElementsByTagNameNS(
    "http://www.epson-pos.com/schemas/2011/03/epos-print",
    "response",
  )[0];
  if (!result || xml.querySelector("parsererror"))
    throw new EpsonError(
      "Keine gültige Epson-Antwort. Ausdruck und ePOS-Konfiguration prüfen.",
    );
  return epsonStatus(
    result.getAttribute("success"),
    result.getAttribute("code"),
    result.getAttribute("status"),
  );
}
export function probePrinter(config: EpsonConfig) {
  return send(config, "");
}
export async function printPdf(
  config: EpsonConfig,
  bytes: Uint8Array,
  copy = false,
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: "/vendor/pdf-fonts/",
  });
  const pdf = await task.promise;
  let images = "";
  try {
    const width = config.printer_width_dots || 576;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        base = page.getViewport({ scale: 1 }),
        viewport = page.getViewport({ scale: width / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context)
        throw new EpsonError(
          "Druckbild konnte nicht erzeugt werden.",
          "failed",
        );
      await page.render({
        canvas,
        canvasContext: context,
        viewport,
        background: "rgb(255,255,255)",
      }).promise;
      for (let y = 0; y < canvas.height; y += 256) {
        const height = Math.min(256, canvas.height - y),
          rgba = context.getImageData(0, y, width, height).data;
        const packed = monochromeRaster(rgba, width, height);
        const b64 = btoa(
          Array.from(packed, (b) => String.fromCharCode(b)).join(""),
        );
        images += `<image width="${width}" height="${height}" color="color_1" mode="mono" align="left">${b64}</image>`;
      }
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      if (images.length > 1900000)
        throw new EpsonError(
          "Bon ist für einen einzelnen Druckauftrag zu lang. PDF-Ausgabe verwenden.",
          "failed",
        );
    }
  } finally {
    await task.destroy();
  }
  return send(
    config,
    `${copy ? '<text lang="de" align="center">KOPIE / ERNEUTER AUSDRUCK&#10;</text>' : ""}${images}<feed line="3"/><cut type="feed"/>`,
  );
}
