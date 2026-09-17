import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Getränke Elias",
    short_name: "Elias",
    description: "Dein Getränkemarkt in Heilbronn",
    start_url: "/",
    display: "standalone",
    background_color: "#f9faf5",
    theme_color: "#a3be34",
    lang: "de",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
