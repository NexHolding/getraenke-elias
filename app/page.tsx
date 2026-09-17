import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Truck,
  Wine,
  Droplets,
  Beer,
  GlassWater,
  Leaf,
  MapPin,
  Phone,
  PackageCheck,
} from "lucide-react";
import SiteShell, {
  Hours,
  MapCard,
  ServiceStrip,
} from "@/components/site-shell";
export default function Home() {
  return (
    <SiteShell>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="green-dot" /> DEIN GETRÄNKEMARKT IN HEILBRONN
            </span>
            <h1>
              Gute Getränke.
              <br />
              Gute <span>Nachbarschaft.</span>
            </h1>
            <p>
              Für den Alltag. Für die große Runde. Für deinen Geschmack.
              <br className="desktop-only" /> Entdecke deine Lieblingsgetränke
              bei Elias –<br className="desktop-only" /> oder lass sie dir
              einfach nach Hause bringen.
            </p>
            <div className="hero-buttons">
              <Link href="/sortiment" className="button">
                Sortiment entdecken <ArrowUpRight size={19} />
              </Link>
              <Link href="/lieferservice" className="text-link">
                Unser Lieferservice <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-local">
              <span className="local-icon">
                <MapPin size={19} />
              </span>
              <span>
                Ganz in deiner Nähe.
                <br />
                <strong>Wartbergstraße 3, Heilbronn</strong>
              </span>
            </div>
          </div>
          <div className="hero-image">
            <Image
              src="/images/drinks-hero.jpg"
              alt="Erfrischende Getränke in Mehrwegflaschen mit Zitrusfrüchten – illustrative Getränkefotografie"
              fill
              priority
              sizes="(max-width: 800px) 100vw, 55vw"
            />
            <div className="hero-sticker">
              <Truck size={29} />
              <strong>
                Du bestellst.
                <br />
                Wir tragen.
              </strong>
              <span>Dein Elias Lieferservice</span>
            </div>
            <div className="photo-caption">
              <span /> Eine gute Auswahl. Für gute Momente.
            </div>
          </div>
        </div>
      </section>
      <ServiceStrip />
      <section className="section container">
        <div className="section-head">
          <div>
            <span className="eyebrow">VON STILL BIS SPRITZIG</span>
            <h2>Was darf’s für dich sein?</h2>
          </div>
          <Link className="text-link" href="/sortiment">
            Das ganze Sortiment <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="category-grid">
          {[
            {
              name: "Mineralwasser",
              sub: "Erfrischend. Jeden Tag.",
              icon: Droplets,
              color: "water",
              num: "01",
            },
            {
              name: "Bier",
              sub: "Auf die guten Momente.",
              icon: Beer,
              color: "beer",
              num: "02",
            },
            {
              name: "Limonade",
              sub: "Ein Schluck gute Laune.",
              icon: GlassWater,
              color: "soda",
              num: "03",
            },
            {
              name: "Wein",
              sub: "Guter Geschmack von hier.",
              icon: Wine,
              color: "wine",
              num: "04",
            },
          ].map((c) => (
            <Link
              href={`/sortiment?kategorie=${encodeURIComponent(c.name)}`}
              key={c.name}
              className={`category-card ${c.color}`}
            >
              <div className="category-top">
                <span>{c.num} / SORTIMENT</span>
                <ArrowUpRight size={23} />
              </div>
              <c.icon className="category-icon" strokeWidth={1.1} />
              <h3>{c.name}</h3>
              <p>{c.sub}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="delivery-banner container">
        <div className="delivery-copy">
          <span className="eyebrow light">
            WENIGER SCHLEPPEN. MEHR GENIESSEN.
          </span>
          <h2>
            Dein Durst.
            <br />
            Unser Lieferservice.
          </h2>
          <p>
            Ob Wasservorrat fürs Büro, Lieblingsbier für zuhause oder Getränke
            für deine nächste Feier: Wir bringen deine Auswahl zu dir.
          </p>
          <Link href="/lieferservice" className="button">
            Mehr zum Lieferservice <ArrowUpRight size={19} />
          </Link>
        </div>
        <div className="delivery-steps">
          <div>
            <span>01</span>
            <div>
              <h3>Lieblingsgetränke auswählen</h3>
              <p>Stöbere im Sortiment und fülle deine Auswahl.</p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <h3>Lieferung persönlich abstimmen</h3>
              <p>Wir bestätigen deine Anfrage und den Termin.</p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <h3>Tür auf. Getränke da.</h3>
              <p>Ab 4 Kisten. Lieferung im Listenpreis enthalten.</p>
            </div>
          </div>
          <div className="delivery-note">
            <PackageCheck size={22} />
            <span>Für zuhause, Unternehmen & Veranstaltungen.</span>
          </div>
        </div>
      </section>
      <section className="section container local-section">
        <div>
          <span className="eyebrow">PERSÖNLICH. REGIONAL. ELIAS.</span>
          <h2>
            Dein Getränkemarkt.
            <br />
            Mitten in Heilbronn.
          </h2>
          <p className="section-intro">
            Ein guter Getränkemarkt ist mehr als volle Regale. Bei uns findest
            du die passende Erfrischung und jemanden, der dich persönlich berät.
          </p>
          <div className="local-points">
            <span>
              <Leaf size={20} /> Eine Auswahl mit regionalem Charakter
            </span>
            <span>
              <Wine size={20} /> Vom Mineralwasser bis zum Festtagswein
            </span>
          </div>
          <Link href="/kontakt" className="text-link">
            Lerne uns kennen <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="visit-card">
          <div className="visit-title">
            <MapPin size={22} />
            <h3>Komm vorbei. Wir freuen uns.</h3>
          </div>
          <p>Wartbergstraße 3 · 74076 Heilbronn</p>
          <Hours />
          <a href="tel:+4971317975225" className="text-link">
            <Phone size={17} /> 07131 / 797 52 25
          </a>
        </div>
      </section>
      <section className="container location-section">
        <MapCard />
        <div>
          <span className="eyebrow">UM DIE ECKE STATT IRGENDWO</span>
          <h2>
            Gute Getränke
            <br />
            sind ganz nah.
          </h2>
          <p>
            Besuche uns in der Wartbergstraße.
            <br />
            Wir helfen dir, das Richtige zu finden.
          </p>
          <a
            href="https://www.google.com/maps/search/?api=1&query=Getr%C3%A4nke+Elias+Wartbergstra%C3%9Fe+3+Heilbronn"
            target="_blank"
            rel="noreferrer"
            className="button secondary"
          >
            Route planen <ArrowUpRight size={18} />
          </a>
        </div>
      </section>
    </SiteShell>
  );
}
