# Getränke Elias – Umsetzungsplan
Stand: 17.09.2026

## Reihenfolge und Abnahme
1. Originalquellen sichern; alle 108 Katalogpositionen importieren, fehlende Pfandwerte/Bestände kennzeichnen.
2. Responsive Markenwebsite, Sortiment, unverbindliche Lieferanfrage, Standort/Öffnungszeiten, datensparsame Karte und Social-Link.
3. Supabase: Anmeldung, Rollen, RLS, Artikel, Lieferanten, Bestände, Bestellungen, Belege, Einstellungen und Prüfprotokoll.
4. CRM: Übersicht, Einzel-/Mehrfachpflege, Lieferanten, Wareneingang, Mindest-/Zielbestand und Nachbestellentwürfe.
5. Browserkasse: Cent-genaue Netto-/Brutto-/Pfandberechnung, Rücknahme, Zahlart, Testbelege und Druck. Echtbetrieb erst mit konfigurierter und vollständig abgenommener Fiskalisierung.
6. Finanzen: Tages-/Monatsauswahl, Abschlüsse, PDF und CSV mit getrennten Steuer-/Pfandbeträgen. Testdaten strikt als Testdaten kennzeichnen.
7. Schnittstellen: sichere E-Mail-Konfiguration, Domain, Instagram, TSE und Druckereinstellungen. Keine Demo-Bestellungen versenden.
8. Automatisierte Tests für Geld, Validierung, Authentifizierung und kritische Datenbankabläufe; Browserprüfung Desktop/Tablet/Mobil.
9. GitHub, Vercel und Supabase veröffentlichen und Livezustand prüfen.
10. Nach finaler Web-Abnahme: native iPad-Kassen-App und Kunden-App; Apple Signing, Drucker-SDK und Hardwareabnahme separat erforderlich.

## Datenherkunft
- https://getraenke-elias.de/ (Adresse, Telefon, Leistungen)
- https://getraenke-elias.de/opening.php (Öffnungszeiten)
- https://getraenke-elias.de/imprint.php (Inhaber)
- https://getraenke-elias.de/download/GetraenkeEliasFlyer_online.pdf (108 Positionen, Stand Februar 2026)
- Original-Logo: https://getraenke-elias.de/images/logo_elias_s.png

Unbekannt: echter Lieferant, EK-Preise, Ist-Bestände, artikelgenaues Pfand, eindeutige Varianten/EAN, bestätigte aktuelle Verkaufspreise, Instagram-Konto, Liefergebiet, E-Mail-Zugang, TSE-Vertrag, Bondrucker. Die im Alt-Impressum genannte USt-ID hat ein unplausibles Format und wird nicht ungeprüft übernommen. Sammelpositionen mit mehreren Sorten bleiben als solche erkennbar. Die Importpreise sind Lieferpreise und werden nicht stillschweigend als bestätigte Ladenpreise verwendet.
