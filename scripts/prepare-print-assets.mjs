import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("public/vendor", { recursive: true });
await copyFile(
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  "public/vendor/pdf.worker.min.mjs",
);
await cp("node_modules/pdfjs-dist/standard_fonts", "public/vendor/pdf-fonts", {
  recursive: true,
});
