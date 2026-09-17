# Getränke Elias

Next.js 16 / React 19 / TypeScript, Supabase Postgres/Auth und Vercel. Website mit 149 aktiven Artikel-SKUs, Lieferbestellung und Kundenportal, CRM, Browserkasse im Einrichtungsmodus und mobile Auslieferung.

## Stand und Veröffentlichung
Die Erweiterung ist lokal implementiert und isoliert geprüft. **Migrationen 005–011 sind noch nicht auf Produktion angewendet.** Der Prüfzweig `codex/operations-expansion` löst bewusst keine Vercel-Veröffentlichung aus. Erst die Datenbank umstellen und prüfen, danach die passende Anwendung veröffentlichen. Freigabestand und Grenzen: [Erweiterung](docs/ERWEITERUNG-2026-09-17.md).

## Entwicklung
1. `npm ci`
2. `.env.local` anhand `.env.example` mit den projektspezifischen Zugangsdaten einrichten. Niemals Geheimnisse einchecken. `SETTINGS_ENCRYPTION_KEY` ist der dauerhaft aufzubewahrende 32-Byte-Schlüssel für SMTP-Konfigurationen.
3. `npm run dev`
4. `npm test`, `npm run test:db`, `npm run lint`, `npm run build`

## Daten und Zugriffe
- Migrationen in `supabase/migrations/` in Dateinamensreihenfolge. Die sieben neuen Migrationen erweitern Tabellen, Funktionen und Zugriffsregeln; keine dieser Änderungen ist bereits live.
- `data/catalog-original.json`: 108 Original-Flyerpositionen. `data/catalog.json`: 149 aktive SKUs nach Sortentrennung. Archivierte Sammelpositionen bleiben für historische Referenzen erhalten.
- Pfandprofile berechnen Flaschen- und Kastenpfand serverseitig. Unklare Verpackungen und nicht spezifizierte Sorten stehen in den Artikelnotizen. Keine erfundenen Lagerbestände oder EANs. [Quellen](docs/PFAND-UND-BILDQUELLEN.md).
- RLS auf allen Geschäftstabellen, serverseitige Autorisierung pro Modul. Inhaberstatus wird ausschließlich in `staff` vergeben, niemals aus vom Benutzer änderbaren Auth-Metadaten.
- `global_admin` ist ein Alias für ein reguläres Supabase-Auth-Konto, kein Auth-Bypass. Passwörter befinden sich nicht im Repository.
- Geräteanmeldung mit separat gehashten Gerätesitzungen und Mitarbeiter-PINs. Eine PIN-Sitzung übernimmt nie parallel vorhandene Inhaberrechte.
- SMTP-Geheimnisse werden mit AES-256-GCM verschlüsselt. Lieferantenversand benötigt aktive Automatik, Bestelladresse, SMTP und Freigabe zum automatischen Versand. Der Lieferantenname allein beeinflusst den Versand nicht.
- Kasse und Auslieferung buchen bekannte Bestände atomar. Wiederholte Buchungen sind idempotent. Unterschriebene Lieferscheine und Rechnungsinhalte sind gegen nachträgliches Überschreiben geschützt.
- Einrichtung kann vom Inhaber ausdrücklich zurückgesetzt werden: Einrichtungsbuchungen und Abschlüsse entfernen, zugehörige Bestandsbewegungen zurückdrehen und Lieferaufträge wieder öffnen. Stammdaten bleiben bestehen. Kein Reset nach Fiskalaktivierung.

## Bereiche
Öffentlich: `/`, `/sortiment`, `/lieferservice`, `/kontakt`, `/impressum`, `/datenschutz`, `/konto`.
Verwaltung: `/login`, `/crm`, `/crm/finanzen`, `/crm/kasse`, `/crm/artikel`, `/crm/bestellungen`, `/crm/kunden`, `/crm/lieferung`, `/crm/einkauf`, `/crm/lieferanten`, `/crm/einstellungen`.
Gerätezugang: `/kassenzugang`; Passwortänderung: `/passwort`.

## Automatik
Vercel prüft stündlich den eingerichteten Bestellrhythmus, Lieferabos und die Tagesplanung. SMTP-Ausgang alle fünf Minuten. Cron-Endpunkte erfordern `CRON_SECRET`. Nachbestellungen werden pro Zeitfenster und Lieferant gebündelt; offene Einkaufspositionen werden angerechnet. Artikelbearbeitungen lösen keine Einzelbestellungen aus. Ohne passende Konfiguration wird nichts versandt.

## Isolierte Prüfungen
`npm run test:db` verwendet PGlite ausschließlich im lokalen Prozess. `scripts/local-fixture-server.mjs` stellt diese SQL-Datenbank auf Loopback bereit, mit simulierten Supabase-Auth-Antworten. Die Browserprüfung `scripts/expansion-browser-check.mjs` erwartet einen lokalen Next-Server auf Port 3017 mit `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54329`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=local-public-validation` und `SUPABASE_SERVICE_ROLE_KEY=local-service-validation`. Diese Platzhalter sind ausschließlich für die lokale Simulation. Die Prüfung darf nicht auf Produktion umgestellt werden. Sie verwendet Google Chrome unter dem macOS-Standardpfad.

## Betriebsgrenzen
Einrichtungsbelege sind keine fiskalisierten Kassenbelege. Die Live-Aktivierung bleibt bis zur Implementierung und Abnahme eines TSE-Adapters gesperrt. Kartenauswahl dokumentiert die Zahlungsart; sie belastet keine Karte. PDF/CSV sind keine DSFinV-K-/DATEV-Schnittstelle. SMTP-/Registrierungsversand, TSE, direkter Bondruck, Kartenterminal und native App-Pakete benötigen ihre konkreten Anbieter und gesonderte Abnahme. Die Tourplanung berücksichtigt Zeitfenster und Entfernungen, aber keine Echtzeit-Straßendaten.

Das Original-Logo liegt in `public/images/elias-logo.png`. Das Hero-Foto ist eine generierte illustrative Getränkeszene, keine Aufnahme des Ladens. Produktfotos stammen aus den dokumentierten Herstellerquellen; fehlende Packshots lassen sich im CRM hochladen.
