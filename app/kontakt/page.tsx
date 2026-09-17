import { Phone, Mail, MapPin, ArrowUpRight } from "lucide-react";
import SiteShell, { Hours, MapCard } from "@/components/site-shell";
export const metadata = { title: "Über uns & Kontakt" };
export default function Page() {
  return (
    <SiteShell>
      <section className="page-heading container">
        <span className="eyebrow">DEIN GETRÄNKEMARKT VOR ORT</span>
        <h1>
          Persönlich da.
          <br />
          <em>Ganz in deiner Nähe.</em>
        </h1>
        <p>
          Frank Elias und dein Getränkeshop in der Wartbergstraße. Wir freuen
          uns auf deinen Besuch, deinen Anruf oder deine Nachricht.
        </p>
      </section>
      <section className="container contact-grid">
        <div className="visit-card">
          <h2>Besuche uns.</h2>
          <p>
            <MapPin size={18} /> Wartbergstraße 3, 74076 Heilbronn
          </p>
          <Hours />
          <p>
            <a href="tel:+4971317975225">
              <Phone size={18} /> 07131 / 797 52 25
            </a>
          </p>
          <p>
            <a href="mailto:info@getraenke-elias.de">
              <Mail size={18} /> info@getraenke-elias.de
            </a>
          </p>
          <a
            className="text-link"
            href="https://www.google.com/maps/search/?api=1&query=Wartbergstra%C3%9Fe+3+74076+Heilbronn"
            target="_blank"
            rel="noreferrer"
          >
            Route planen <ArrowUpRight size={17} />
          </a>
        </div>
        <MapCard />
      </section>
    </SiteShell>
  );
}
