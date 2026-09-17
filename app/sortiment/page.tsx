import SiteShell from "@/components/site-shell";
import { categories } from "@/lib/catalog";
import CatalogShop from "@/components/catalog-shop";
export const metadata = { title: "Unser Sortiment" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kategorie?: string }>;
}) {
  const q = await searchParams;
  return (
    <SiteShell>
      <section className="page-heading container">
        <span className="eyebrow">GUTER GESCHMACK HAT VIELE SEITEN</span>
        <h1>
          Finde deine <em>Lieblingsgetränke.</em>
        </h1>
        <p>
          Von regionalem Mineralwasser bis zum Feierabendbier. Stell deine
          Auswahl zusammen – wir kümmern uns um den Rest.
        </p>
      </section>
      <section className="container catalog-section">
        <CatalogShop
          initialCategory={
            q.kategorie && categories.includes(q.kategorie)
              ? q.kategorie
              : "Alle Getränke"
          }
        />
      </section>
    </SiteShell>
  );
}
