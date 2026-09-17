import SiteShell from "@/components/site-shell";
export const metadata = { title: "Datenschutz" };
export default function Page() {
  return (
    <SiteShell>
      <article className="legal container">
        <span className="eyebrow">DEINE DATEN</span>
        <h1>Datenschutzhinweise</h1>
        <h2>Verantwortlicher</h2>
        <p>
          Frank Elias, Getränkeshop Elias, Wartbergstraße 3, 74076 Heilbronn.
          Kontakt: info@getraenke-elias.de, Telefon +49 7131 797 52 25.
        </p>
        <h2>Lieferanfragen</h2>
        <p>
          Wenn du eine Lieferanfrage sendest, verarbeiten wir deinen Namen,
          E-Mail-Adresse, Telefonnummer, Lieferadresse, deine Getränkeauswahl
          und freiwillige Hinweise zur Bearbeitung deiner Anfrage und zur
          Vertragsanbahnung (Art. 6 Abs. 1 lit. b DSGVO). Die Daten werden nur
          so lange gespeichert, wie es für die Bearbeitung sowie gegebenenfalls
          bestehende gesetzliche Aufbewahrungspflichten erforderlich ist. Bitte
          übermittle keine sensiblen Daten in den Freitextfeldern.
        </p>
        <h2>Website und Datenbank</h2>
        <p>
          Das Hosting erfolgt über Vercel; die Anfragedaten werden in einer
          Supabase-Datenbank in der EU-Region Frankfurt verarbeitet. Beim
          Zugriff werden technisch notwendige Verbindungsdaten verarbeitet, um
          die Website bereitzustellen und abzusichern (Art. 6 Abs. 1 lit. f
          DSGVO). Die Anbieter können Unterauftragsverarbeiter einsetzen.
          Verträge zur Auftragsverarbeitung und gegebenenfalls Garantien für
          Drittlandübermittlungen sind vor dem regulären Geschäftsbetrieb durch
          den Verantwortlichen zu vervollständigen.
        </p>
        <h2>Lokale Speicherung und Anmeldung</h2>
        <p>
          Deine Getränkeauswahl wird für die laufende Sitzung im Browser
          gespeichert. Für den geschützten Mitarbeiterbereich werden technisch
          erforderliche Anmeldedaten in Cookies verwendet. Es gibt auf dieser
          Website keine Werbe- oder Analyse-Cookies.
        </p>
        <h2>Google Maps und externe Links</h2>
        <p>
          Die Google-Karte wird erst geladen, wenn du „Google-Karte laden“
          auswählst. Dabei werden Verbindungsdaten, insbesondere deine
          IP-Adresse, an Google übertragen (Einwilligung, Art. 6 Abs. 1 lit. a
          DSGVO). Ohne Zustimmung bleibt die Karte deaktiviert. Externe Links zu
          Google Maps oder Instagram öffnen die jeweilige Website erst beim
          Anklicken. Dort gelten die Datenschutzhinweise des jeweiligen
          Anbieters.
        </p>
        <h2>Deine Rechte</h2>
        <p>
          Du hast nach Maßgabe der gesetzlichen Voraussetzungen das Recht auf
          Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und
          Datenübertragbarkeit. Bei einer Verarbeitung auf Grundlage
          berechtigter Interessen kannst du widersprechen. Eine Einwilligung
          kannst du für die Zukunft widerrufen. Außerdem kannst du dich bei
          einer Datenschutzaufsichtsbehörde beschweren, insbesondere beim
          Landesbeauftragten für den Datenschutz und die Informationsfreiheit
          Baden-Württemberg.
        </p>
        <p>
          Stand: September 2026. Vor dem regulären Betrieb müssen die konkreten
          Anbieter-Verträge, Löschfristen und betrieblichen Abläufe mit diesen
          Hinweisen abgeglichen werden.
        </p>
      </article>
    </SiteShell>
  );
}
