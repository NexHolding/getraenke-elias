"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { nativeApp } from "@/lib/native-app";
import { useDialog } from "./use-dialog";
export default function PdfPreview() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useDialog(!!url, () => setUrl(""));
  useEffect(() => {
    const open = (e: Event) => {
      const value = (e as CustomEvent<string>).detail;
      if (
        /^\/api\/cash-book(?:\?period=\d{4}-\d{2}(?:-\d{2})?&format=pdf|\/document\?id=[a-f0-9-]+)$/.test(
          value,
        ) ||
        /^\/api\/(delivery-list\?date=\d{4}-\d{2}-\d{2}|receipts\/[a-f0-9-]+\?format=pdf|documents\/(invoice|delivery)\/[a-f0-9-]+|communications\/attachments\/[a-f0-9-]+(?:\?customer=[a-f0-9-]+)?)$/.test(
          value,
        )
      ) {
        setError("");
        setLoading(true);
        setUrl(value);
      }
    };
    window.addEventListener("elias:pdf-preview", open);
    return () => window.removeEventListener("elias:pdf-preview", open);
  }, []);
  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    let destroyed = false;
    let cleanup: (() => void) | undefined;
    const holder = container.current;
    holder?.replaceChildren();
    async function render() {
      const response = await fetch(url, {
        signal: abort.signal,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          "Dokument konnte nicht geladen werden. Bitte Berechtigung und Verbindung prüfen.",
        );
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
      const task = pdfjs.getDocument({
        data: new Uint8Array(await response.arrayBuffer()),
        standardFontDataUrl: "/vendor/pdf-fonts/",
      });
      cleanup = () => {
        void task.destroy();
      };
      if (destroyed) {
        cleanup();
        return;
      }
      const pdf = await task.promise;
      for (let n = 1; n <= pdf.numPages; n++) {
        if (destroyed) return;
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute("role", "img");
        canvas.setAttribute(
          "aria-label",
          `${url.startsWith("/api/receipts/") ? "Bon" : "Dokument"} · Seite ${n}`,
        );
        const context = canvas.getContext("2d");
        if (!context) throw Error("PDF-Anzeige nicht verfügbar.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (!destroyed) holder?.appendChild(canvas);
      }
      if (!destroyed) setLoading(false);
    }
    render().catch((e) => {
      if (!destroyed) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => {
      destroyed = true;
      abort.abort();
      cleanup?.();
    };
  }, [url]);
  const print = async () => {
    const canvases = container.current?.querySelectorAll("canvas");
    if (!canvases?.length) return;
    const frame = document.createElement("iframe");
    frame.style.cssText =
      "position:fixed;width:1px;height:1px;bottom:0;left:0;border:0";
    frame.title = "Elias Dokument drucken";
    document.body.appendChild(frame);
    const target = frame.contentDocument;
    if (!target) {
      frame.remove();
      return;
    }
    target.open();
    target.write(
      `<!doctype html><html><head><title>Elias Dokument</title><style>@page{size:A4 ${canvases[0].width > canvases[0].height ? "landscape" : "portrait"};margin:0}body{margin:0}img{display:block;width:100%;break-after:page}img:last-child{break-after:auto}</style></head><body></body></html>`,
    );
    target.close();
    try {
      for (const canvas of canvases) {
        const img = target.createElement("img");
        img.src = canvas.toDataURL("image/png");
        target.body.appendChild(img);
        await img.decode();
      }
      frame.contentWindow?.addEventListener(
        "afterprint",
        () => frame.remove(),
        { once: true },
      );
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60000);
    } catch {
      frame.remove();
      setError(
        "Druckansicht konnte nicht geöffnet werden. Bitte die PDF herunterladen.",
      );
    }
  };
  if (!url) return null;
  const title = url.startsWith("/api/receipts/") ? "PDF-Bon" : "PDF-Dokument";
  return (
    <div
      className="pdf-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section className="pdf-preview">
        <header>
          <h2>
            {url.startsWith("/api/delivery-list") ? "Lieferliste" : title}
          </h2>
          {(url.startsWith("/api/delivery-list") ||
            url.startsWith("/api/cash-book")) &&
            !loading &&
            !error && (
              <div className="inline-actions">
                {!nativeApp() && (
                  <button className="button" onClick={print}>
                    Drucken
                  </button>
                )}
                <a
                  className="button secondary"
                  href={`${url}&download=1`}
                  download
                >
                  {nativeApp()
                    ? "Drucken / teilen"
                    : url.startsWith("/api/cash-book/document")
                      ? "Originalbeleg herunterladen"
                      : "PDF herunterladen"}
                </a>
              </div>
            )}
          <button
            autoFocus
            type="button"
            aria-label={`${title} schließen`}
            onClick={() => setUrl("")}
          >
            <X />
          </button>
        </header>
        {loading && <p role="status">Dokument wird geladen …</p>}
        {error && <p role="alert">{error}</p>}
        <div className="pdf-preview-pages" ref={container} />
      </section>
    </div>
  );
}
