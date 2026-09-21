"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
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
        /^\/api\/(receipts\/[a-f0-9-]+\?format=pdf|documents\/(invoice|delivery)\/[a-f0-9-]+|communications\/attachments\/[a-f0-9-]+(?:\?customer=[a-f0-9-]+)?)$/.test(
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
          <h2>{title}</h2>
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
