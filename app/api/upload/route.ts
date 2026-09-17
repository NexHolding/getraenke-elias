import { requireStaff, serviceDb, safeError, sameOrigin } from "@/lib/server";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireStaff("artikel");
    const f = (await req.formData()).get("file");
    if (!(f instanceof File) || f.size > 5 * 1024 * 1024 || f.size === 0)
      throw new Error("HINWEIS:Bitte ein Produktfoto bis 5 MB auswählen.");
    const bytes = Buffer.from(await f.arrayBuffer());
    const ext = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? "jpg"
      : bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? "png"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!ext)
      throw new Error(
        "HINWEIS:Erlaubt sind echte JPG-, PNG- und WebP-Dateien.",
      );
    const db = serviceDb();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage
      .from("product-images")
      .upload(path, bytes, {
        contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        upsert: false,
      });
    if (error) throw error;
    return Response.json({
      url: db.storage.from("product-images").getPublicUrl(path).data.publicUrl,
    });
  } catch (e) {
    return safeError(e);
  }
}
