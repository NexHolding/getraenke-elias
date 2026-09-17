import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/crm", "/api", "/login"] },
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://getraenke-elias.vercel.app"}/sitemap.xml`,
  };
}
