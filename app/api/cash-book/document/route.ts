import { cashAccess } from "@/lib/cash-book-server";
import { serviceDb, safeError } from "@/lib/server";
import { z } from "zod";
export async function GET(req: Request) {
  try {
    await cashAccess();
    const id = z.uuid().parse(new URL(req.url).searchParams.get("id"));
    const { data, error } = await serviceDb()
      .from("cash_documents")
      .select("*")
      .eq("entry_id", id)
      .single();
    if (error) throw error;
    let bytes: Uint8Array = Buffer.from(data.base64, "base64");
    let mime = data.mime;
    let filename = data.filename;
    if (
      mime !== "application/pdf" &&
      new URL(req.url).searchParams.get("download") !== "1"
    ) {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF();
      const info = pdf.getImageProperties(bytes);
      const width = 180;
      const height = Math.min(260, (width * info.height) / info.width);
      const w = (height * info.width) / info.height;
      pdf.addImage(
        bytes,
        mime === "image/png" ? "PNG" : "JPEG",
        15,
        15,
        w,
        height,
      );
      bytes = new Uint8Array(pdf.output("arraybuffer"));
      mime = "application/pdf";
      filename = filename + ".pdf";
    }
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
