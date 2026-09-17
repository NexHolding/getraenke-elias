import Link from "next/link";
import Image from "next/image";
import {
  ArrowUpRight,
  Truck,
  Home,
  Building2,
  PartyPopper,
} from "lucide-react";
import SiteShell from "@/components/site-shell";
export const metadata = { title: "Lieferservice" };
export default function Page() {
  return (
    <SiteShell>
      <section className="container service-hero">
        <div>
          <span className="eyebrow">WIR BRINGEN’S VORBEI</span>
          <h1>
            Getränke da.
            <br />
            <em>Schleppen erledigt.</em>
          </h1>
          <p>
            Dein Lieblingsgetränk kommt zu dir. Für zuhause, fürs Team und für
            die nächste große Runde.
          </p>
          <Link href="/sortiment" className="button">
            Getränke auswählen <ArrowUpRight size={18} />
          </Link>
        </div>
        <Image
          src="/images/drinks-hero.jpg"
          width={720}
          height={480}
          alt="Bunte Auswahl an Getränken"
        />
      </section>
      <section className="container section">
        <div className="three-grid">
          {[
            [
              Home,
              "Für zuhause",
              "Der Vorrat für deinen Alltag. Wasser, Schorle und alles, was dir schmeckt.",
            ],
            [
              Building2,
              "Für dein Unternehmen",
              "Getränke fürs Büro, für deine Gäste und deinen Gastronomiebetrieb.",
            ],
            [
              PartyPopper,
              "Für deine Veranstaltung",
              "Getränke und Ausstattung wie Kühlwagen, Zapfanlage und Biertischgarnituren.",
            ],
          ].map(([I, t, p]) => {
            const Icon = I as typeof Truck;
            return (
              <article className="info-card" key={String(t)}>
                <Icon />
                <h2>{String(t)}</h2>
                <p>{String(p)}</p>
              </article>
            );
          })}
        </div>
        <div className="content-split">
          <div>
            <span className="eyebrow">SO EINFACH GEHT’S</span>
            <h2>
              Du suchst aus.
              <br />
              Wir stimmen alles ab.
            </h2>
            <p>
              Wähle mindestens vier Kisten und sende uns eine unverbindliche
              Anfrage. Wir melden uns mit der Verfügbarkeit, dem Pfandbetrag und
              einem passenden Liefertermin.
            </p>
            <p>
              Die Preise aus unserer Lieferliste enthalten bereits Lieferung und
              gesetzliche Mehrwertsteuer. Pfand kommt separat hinzu.
              Liefergebiet und Leergutmitnahme klären wir persönlich.
            </p>
            <a className="text-link" href="tel:+4971317975225">
              Lieber anrufen? 07131 / 797 52 25 <ArrowUpRight size={17} />
            </a>
          </div>
          <div className="notice large">
            <h3>Gut zu wissen</h3>
            <ul>
              <li>Mindestabnahme: 4 Kisten</li>
              <li>Listenpreise inklusive Lieferung und MwSt.</li>
              <li>Pfand wird separat berechnet</li>
              <li>Termin und Lieferadresse nach Absprache</li>
              <li>Alterskontrolle bei der Übergabe alkoholischer Getränke</li>
            </ul>
            <a
              href="/elias-lieferliste-original.pdf"
              target="_blank"
              className="text-link"
            >
              Original-Lieferliste ansehen <ArrowUpRight size={17} />
            </a>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
