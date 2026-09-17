import SiteShell from "@/components/site-shell";
export const metadata = { title: "Impressum" };
export default function Page() {
  return (
    <SiteShell>
      <article className="legal container">
        <span className="eyebrow">RECHTLICHES</span>
        <h1>Impressum</h1>
        <h2>Angaben zum Anbieter</h2>
        <p>
          Getränkeshop Elias
          <br />
          Inhaber: Frank Elias
          <br />
          Wartbergstraße 3<br />
          74076 Heilbronn, Deutschland
        </p>
        <h2>Kontakt</h2>
        <p>
          Telefon: +49 7131 797 52 25
          <br />
          Fax: +49 7131 797 52 40
          <br />
          E-Mail:{" "}
          <a href="mailto:info@getraenke-elias.de">info@getraenke-elias.de</a>
        </p>
        <h2>Bildnachweise</h2>
        <p>
          Original-Logo: Getränkeshop Elias. Die Getränkefotografie wurde für
          diese Website mit KI erstellt und zeigt keine tatsächliche Aufnahme
          des Geschäfts.
        </p>
        <p className="notice">
          Diese neue Website befindet sich in der Einrichtung. Die
          Umsatzsteuer-Identifikationsnummer wird nach Prüfung durch den Inhaber
          ergänzt. Über das Sortiment sind derzeit ausschließlich unverbindliche
          Anfragen möglich.
        </p>
      </article>
    </SiteShell>
  );
}
