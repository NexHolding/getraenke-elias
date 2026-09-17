import SiteShell from "@/components/site-shell";
export const metadata = {
  title: "Bestellung abschließen",
  robots: { index: false, follow: false },
};
export default function AppCheckout() {
  return (
    <SiteShell>
      <section className="container section">
        <span className="eyebrow">DEINE ELIAS BESTELLUNG</span>
        <h1>Fast bei dir.</h1>
        <p>
          Prüfe deinen Warenkorb und gib deine Lieferadresse ein. Elias
          bestätigt anschließend den Liefertermin.
        </p>
        <p>
          Der Warenkorb öffnet sich nach der Übernahme aus der App. Über das
          Warenkorbsymbol kannst du ihn erneut öffnen.
        </p>
      </section>
    </SiteShell>
  );
}
