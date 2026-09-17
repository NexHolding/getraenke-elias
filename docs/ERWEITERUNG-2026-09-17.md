# Ausbauplan vom 17.09.2026

Verbindliche Arbeitsliste aus der Kundenrückmeldung. Browser und API müssen dieselben Berechtigungen und Berechnungen verwenden.

1. Sortiment: Sorten als eigene SKU, gruppierte Auswahl; Produktfotos mit Herkunft; Bild-Upload; Gebinde- und Pfandprofile; Kategorien im Lager und in der Kasse.
2. Betrieb: Kasse/Finanzen ohne permanente Testüberschriften; Einrichtungsmodus, kontrollierter Live-Schalter, Netto/USt/Brutto, Bar/Karte, Rabatte ohne Pfandrabatt, Tages-/Monatsberichte, Einrichtung zurücksetzen.
3. Verwaltung: zweite Einstellungsnavigation; Lieferantenstammdaten und automatische Nummern; Mitarbeiterdaten, Rechte je Modul, Rabattrecht; angemeldetes Kassengerät mit Mitarbeiterwahl und PIN.
4. Kunden: Registrierung und Bestätigung, Kundenportal und Gastschalter, Nummern, CRM-Kundenakte mit offenen Bestellungen und Dokumenten, Rechnungsversandpräferenz.
5. Auslieferung: versionierte Lieferscheine, Teilmengen/offene Restmengen, mobile Unterschrift, Rechnungsablage und E-Mail-Ausgang; Lieferkalender, Zeitfenster, Abstellgenehmigung, Lieferabos, Tagesroute/Navigation/Beladereihenfolge und geschätzte Zeiten.
6. Automatik: gebündelte Nachbestellung nach Wochentag/Uhrzeit/Rhythmus, offene Einkaufspositionen berücksichtigen; wiederkehrende Lieferaufträge, tägliche Planung.
7. Abnahme: Migration, Zugriffsgrenzen, Berechnungen, Teil-/Doppelauslieferung, Browser auf Desktop und Mobil, PDFs, Build, GitHub/Vercel.

## Betriebsgrenze
Der Einrichtungsmodus ist vollständig bedienbar und getrennt vom späteren Fiskalbetrieb. Ein echter TSE-Vertrag, fiskalischer Adapter, DSFinV-K und Drucker-Hardwareabnahme bleiben Teil der Inbetriebnahme. Ein Konfigurationshaken darf keine vorhandene TSE-Signatur vortäuschen. Einrichtungsbelege tragen einen dezenten eindeutigen Hinweis. Rücksetzung erfolgt ausdrücklich und nur im Einrichtungsmodus.

## Datenqualität
Der Flyer benennt teilweise keine Verpackungsart oder konkreten Sorten. Diese Fälle werden im CRM sichtbar dokumentiert. Keine erfundenen EANs, Warenbestände oder Produktfotos. Produktfotos werden nur passend zum Produkt eingesetzt; Flaschenfoto und tatsächlich verkauftes Gebinde werden getrennt dargestellt.

## Validierung und Freigabestand
- Isolierte PostgreSQL-kompatible PGlite-Datenbank mit sämtlichen Migrationen: erfolgreich.
- Echte Next.js-Routen gegen isoliertes SQL-Backend mit simulierten Supabase-Auth-Antworten: Sortenwahl, Pfand, Kundenauftrag, Teil-/Restlieferung, PDF, Modulrechte, Rabattrecht und PIN-Gerät erfolgreich geprüft. Keine Aussage über eine bereits erfolgte Produktionsmigration.
- Produktionsbuild erfolgreich; zusätzliche Unit-Tests für Monatsenden, Zeitfenster, Pfandprofile und Rechte.
- Produktionsdaten vor Migration lesend geprüft und privat gesichert: 108 Produkte, 1 Lieferant, 2 Mitarbeiterkonten, keine Bestellungen/Verkäufe/Einkäufe/Abschlüsse/Lagerbewegungen.
- Automatische Freigabeprüfung hat die Produktionsmigration zweimal abgewiesen. Keine neue Migration wurde auf Produktion ausgeführt. Explizite Freigabe der konkreten Migration ist der verbleibende Veröffentlichungsschritt.

## Noch erforderliche Betriebsdaten
- SMTP-Zugang fehlt: Belege werden im Ausgang vorbereitet; tatsächlicher E-Mail-Versand und Registrierungsmails müssen mit dem gewählten SMTP-/Auth-Anbieter abschließend geprüft werden.
- Vollständige Hersteller-Packshots sind nicht für alle Artikel eindeutig zuordenbar. Passende recherchierte Fotos sind hinterlegt; alle anderen Artikel nutzen die Uploadfunktion statt eines erfundenen Produktfotos. Quellen: `data/image-sources.json`.
- Bei nicht präzisierten Sorten („verschiedene Sorten“) und nicht eindeutiger Verpackung nennt der importierte Flyer keine belastbaren Einzelangaben. Die Artikelnotiz dokumentiert das. Der Inhaber kann Sortengruppen ergänzen und Pfandprofile am realen Gebinde abgleichen. Keine erfundenen EANs oder Lagerbestände.
- Geocodierung wird vom Inhaber aktiviert; die Route ist eine Zeitfenster-/Entfernungsheuristik, keine verkehrsabhängige Straßennavigation. Google Maps/Apple Karten übernehmen die Navigation.
- Direkte Epson-/Star-Ansteuerung, Kartenterminal, echter TSE-/DSFinV-K-Adapter und native App-Store-Pakete bleiben separat abgenommenen Integrationen vorbehalten.

## Prüfansichten und Musterbelege
Alle folgenden Ansichten und Belege enthalten ausschließlich erfundene Daten aus der isolierten Prüfung:
- [Kasse mit Pfandrücknahme](preview/kasse.png)
- [Mobile Übergabe mit Unterschrift](preview/mobile-unterschrift.png)
- [Musterrechnung](preview/rechnung.pdf), [unterschriebener Lieferschein](preview/lieferschein.pdf)
- [80-mm-Bon](preview/bon.pdf), [Tagesbericht mit Bar/Karte](preview/tagesbericht.pdf)

## Konkret vorbereitete Produktionsänderung
Freizugebendes Ziel: vorhandenes Supabase-Projekt `sfggvhjtsiitqnocridz` und anschließend die dazugehörige Vercel-Anwendung.

| Migration | Wirkung |
| --- | --- |
| 005 | Kunden-, Mitarbeiter-, Liefer- und Rechnungsmodell; Rechte, Geräte-Sitzungen, Produkt-Upload-Bucket, Lieferantennummern; entfernt den Demo-Sonderstatus, der Name „Demo-Lieferant“ bleibt |
| 006 | 28 Sammelpositionen archivieren, benannte Sorten einzeln anlegen; 149 aktive SKUs, Originalpreise und Gebinde bleiben erhalten |
| 007 | Kassenbuchung, Pfand, Rabattrechte, Einrichtungsabschlüsse, Teilmengen, Rechnungen und ausdrücklicher Einrichtungsreset |
| 008 | Wiederkehrende Kundenaufträge, eindeutige Wiederholungsperioden |
| 009 | Dokumentierte Produktfotos zuordnen |
| 010 | Historische Bestell-/Firmendaten auf Belegen sichern; unterschriebene Inhalte sperren |
| 011 | Abweichende Longneck-Pfandprofile für Fritz/Paulaner Spezi korrigieren |

Die Umstellung ändert Berechtigungen und zentrale Buchungsfunktionen. Deshalb müssen Datenbank und Anwendung in dieser Reihenfolge gemeinsam veröffentlicht werden. Eine vorherige Datensicherung liegt außerhalb des Repositorys geschützt vor. Die Automatik bleibt bis zur Konfiguration deaktiviert. Kein E-Mail-Versand wurde bei diesen Prüfungen ausgelöst.

Abschlussprüfung: 11 Unit-Tests, sämtliche 11 Migrationen in isoliertem SQL, Browserablauf mit API-/SQL-Verknüpfung, mobile handschriftliche Signatur, unveränderte historische Teilmengen, Mitarbeiter-E-Mail-Wechsel, PIN-Rechte, Lint/TypeScript/Produktionsbuild erfolgreich. PDF-Seiten wurden gerendert und visuell geprüft. Auth im Browser-Test ist simuliert; SMTP und reale Bestätigungsmails sind damit nicht abgenommen.
