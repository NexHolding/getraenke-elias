# Veröffentlichung vom 17.09.2026

## Ergänzung 021: Manuelle Lieferantenbestellungen

Migration `202609170021_manual_purchases.sql` im vorhandenen Supabase-Projekt angewendet und registriert. Lesender Vorher-/Nachhervergleich: alle 177 vorhandenen Artikel, Lieferant und Einstellungen unverändert; keine Testbestellungen im Produktivsystem angelegt.

Einkauf enthält getrennte manuelle Zusatzbestellungen für Inhaber und Mitarbeiter mit Einkaufsrecht. Offene manuelle Mengen mindern die automatische Bestellmenge nicht. Expliziter E-Mail-Versand, externe Bestellung, Stornierung und Wareneingang sind dokumentiert. Tatsächlicher E-Mail-Versand setzt die noch ausstehende SMTP-Einrichtung voraus.

Prüfung: isolierte Datenbank mit Migrationen 001–021, 100-Kisten-Beispiel einschließlich Berechtigungen, Doppelübermittlung, Versandstatus und einmaligem Wareneingang; Mail-Worker mit lokalem SMTP-Adapter; reale Formkomponente mit simulierten API-Antworten auf Desktop, Tablet und Mobilgerät; 36 Fachtests, bestehende Datenbankprüfungen, ESLint, TypeScript und Produktionsbuild. Produktive Schreibtests mit temporären Konten wurden von der automatischen Freigabeprüfung abgelehnt und durch isolierte Prüfungen ersetzt.

Bedienung: [Manuelle Lieferantenbestellungen](MANUELLE-LIEFERANTENBESTELLUNGEN.md).

Nach ausdrücklicher Freigabe der konkreten Produktionsmigrationen wurden Supabase und die zugehörige Anwendung aktualisiert.

## Veröffentlicht
- Website: https://getraenke-elias.vercel.app
- CRM: https://getraenke-elias.vercel.app/login
- Kundenkonto: https://getraenke-elias.vercel.app/konto
- Supabase: `sfggvhjtsiitqnocridz`; Migrationen 005–011 erfolgreich angewendet.
- GitHub: PR #1 zusammengeführt, Anwendungs-Merge `b05b3b0` (Implementierung `9802c48`).
- Vercel: Produktionsdeployment `dpl_FuypZ1bTf7pM1zvDjmNf9TypJSAj`, Status READY, Region Frankfurt.

Die bereits vorhandenen Basismigrationen 001–004 hatten keine Historieneinträge. Alle zwölf Funktions-Prüfsummen und die Integritätsspalten wurden verglichen; anschließend wurde ausschließlich die fehlende Historie registriert. Die Basis-SQL-Dateien wurden nicht erneut ausgeführt. Private Sicherung vor Migration vorhanden, nicht in Git eingecheckt.

## Live-Prüfung
- 149 aktive Artikel, 42 Bildzuordnungen, keine unbekannten Pfandwerte in aktiven Importartikeln.
- 35 unterschiedliche Bilddateien mit HTTP 200 und Bild-MIME ausgeliefert.
- Sortenwahl „Alwa Limonade Orange“ mit 2,40 Euro Pfand je 6er-Gebinde im Warenkorb geprüft.
- Bestehender Demo-Lieferant namentlich erhalten, automatische Lieferantennummer vorhanden; lediglich der entfallene Demo-Sonderstatus entfernt.
- Beide bisherigen Inhaberzugänge erhalten. Das Loginfeld akzeptiert Benutzernamen wie `global_admin`.
- Echte Supabase-Inhabersitzung mit kurzlebigem, nicht versandtem Einmal-Token geprüft: Dashboard, Artikel, Einstellungen, Kunden, Auslieferung, Finanzen und Kasse erreichbar. Kein Passwort geändert oder ausgegeben.
- Anonyme Aufrufe der Verwaltungs-APIs werden mit 401 abgewiesen; PIN-Hashes werden nicht ausgegeben.
- Keine unbehandelten Browserfehler; mobile Auslieferung ohne horizontalen Überlauf.
- Vercel-Laufzeitfehlerabfrage für das neue Deployment: keine Fehler im geprüften Zeitraum.
- Keine Testbestellungen, Verkäufe, Kunden oder E-Mails bei der Live-Abnahme angelegt. Schreibabläufe waren zuvor in der isolierten SQL-/Browserprüfung abgenommen.

## Auth-Konfiguration
Die bislang auf localhost stehende `site_url` zeigt jetzt auf die veröffentlichte Vercel-Adresse. Erlaubt sind die eigenen Rücksprungseiten `/auth/callback`, `/konto` und `/passwort`. Ausschließlich diese beiden Konfigurationsfelder wurden geändert; E-Mail-Bestätigung, MFA und sonstige Auth-Einstellungen bleiben erhalten. Die Bestätigungspflicht für Kundenkonten ist aktiv. Tatsächlicher Mailversand benötigt weiterhin den passenden SMTP-/Auth-E-Mail-Anbieter.

## Verbleibende Inbetriebnahme
- `getraenke-elias.de` und `www.getraenke-elias.de` zeigen weiterhin auf `89.238.73.150` und die alte Apache-Website. Die Vercel-Aliase sind vorhanden, DNS muss beim bisherigen Anbieter umgestellt werden; siehe [Domainumstellung](DOMAIN-UMSTELLUNG.md).
- Die Kasse bleibt bis zur Integration/Abnahme des TSE-Adapters im Einrichtungsmodus. Veröffentlichung ist keine Aktivierung des Fiskalbetriebs.
- SMTP und automatische Nachbestellungen bleiben deaktiviert. Lieferantenkontakt, E-Mail-Anbieter, TSE und direkt angebundener Bondrucker sind noch zu konfigurieren/abzunehmen.
- Fehlende Packshots sowie unklare Verpackungs-/Sortenangaben bleiben in der Artikelpflege zu ergänzen; Quellen und Annahmen sind dokumentiert.
- Native App-Store-Pakete sind weiterhin die vorgesehene Folgephase.

## Sichtbarkeit des internen Administrators
Der interne Systemzugang bleibt in Supabase Auth und als Inhaber erhalten. Kunden- und Mitarbeiterverzeichnisse filtern ihn serverseitig anhand der reservierten Identität und der verknüpften Benutzer-ID. Er wird nicht in der Mitarbeiter-PIN-Auswahl angeboten; die eigene Sitzungsanzeige lautet neutral „Administration“. Der Aufruf des Kundenportals legt für dieses Konto keine Kundenakte mehr an. Eine bereits angelegte Kundenakte bleibt unsichtbar erhalten. Passwort, Administratorrechte und interne Buchungsnachweise werden nicht verändert.

Prüfung: 12 Fachtests, Lint, Produktionsbuild und isolierter kompletter Browserablauf einschließlich erhaltener Inhaberrechte, ausgeblendeter Verzeichnisse und gesperrter Kundenanlage bestanden. Keine Datenbankmigration erforderlich.

## Ergänzung 017: Belegarchiv, Bezahlen und Epson-Assistent

Migration `202609170017_receipt_output.sql` erfolgreich auf `sfggvhjtsiitqnocridz` angewendet. Vorabprüfung zeigte ausschließlich diese neue Migration. Prüfsummen von Artikeln, Verkäufen, Mitarbeiterrechten, Einstellungen, Lagerbewegungen, Bestellungen und Einkauf vor/nach Migration identisch.

- **Bezahlen** bucht einmalig und öffnet die Belegausgabe. Ausstehende Ausgaben werden wiederaufgenommen.
- Serverseitig gespeicherte, unveränderbare PDF-Bons; Epson-Direktdruck mit Statusprotokoll, ausdrücklicher Kopie bei Wiederholung und Einrichtungsassistent pro Tablet.
- Digitalbon mit Kundenzustimmung und befristetem QR-Download; bewusst bestätigte manuelle Papier-Ersatzausgabe.
- 28 Fach-/Validierungstests, vier Datenbank-Prüfskripte mit allen Migrationen, TypeScript, ESLint und Produktionsbuild bestanden.
- Vollständiger Browsertest mit simulierten Geschäftsdaten und Epson-Antworten: Testbon-Rasterisierung, Doppelklick, unterbrochener Druck, Wiederaufnahme/Kopie, verlorene Buchungsantwort, QR-Code und manuelle Papierausgabe.
- Echte API-Prüfung anhand des bereits vorhandenen Einrichtungsbelegs: archiviert, wiederholter Abruf bytegleich, SHA-256 stimmt; anonymer Zugriff 401, fremder Origin 403, unbekannter Digitalbon-Link 404. Dabei keine neuen Verkäufe, Zahlungen, Lagerbewegungen oder öffentlichen Freigabelinks angelegt.

Hardware noch nicht vor Ort geprüft. Epson-Modell/Netzwerkadresse und Zertifikatsfreigabe auf dem iPad sind im Assistenten einzurichten. Einrichtungsmodus, fehlende TSE-Anbindung und native Folgephase bleiben bestehen. [Bedienung, technische Details und Quellen](EPSON-UND-BEZAHLEN.md).

## Ergänzung 018: Finanzberichte und Steuerberater

Migration `202609170018_finance_reader.sql` ergänzt einen optionalen reinen Finanz-Lesezugriff. Bestehende Mitarbeiterrechte bleiben erhalten. Der ausdrücklich angeforderte Mitarbeiter `steuerberater` ist mit `permissions=["finanzen"]` und `finance_readonly=true` angelegt; das zufällige Passwort wird separat und nicht über Git übergeben.

Tages-/Monats-PDFs wurden in A4-Querformat mit Logo, heller Gestaltung, kleinerer Schrift, Steuerübersicht, Tagesverlauf, Belegjournal und Kassenabschlussabgleich neu aufgebaut. CSV und PDF nutzen dieselbe serverseitige Berechnungsgrundlage; Kassenbons und Lieferrechnungen werden getrennt ausgewiesen. Berliner Zeitraumgrenzen, negative Pfandrücknahmen und getrennte Steuersätze sind geprüft.

31 Fachtests, vier Datenbank-Prüfskripte, TypeScript, ESLint und Produktionsbuild bestanden. Alle Seiten der Layoutmuster mit Poppler gerendert und durchgesehen. Anmeldung mit `steuerberater`, ausschließlich Finanznavigation, erlaubte PDF-/CSV-Downloads, gesperrte Schreibaktionen/andere Bereiche und anonyme Zugriffe im Browser geprüft. Keine neuen Verkäufe, Rechnungen oder Lagerbewegungen durch die Abnahme erzeugt. [Bedienung und Datenumfang](FINANZBERICHTE.md).


## Kundenkommunikation

Migration `202609170019_customer_communications.sql` ergänzt ausschließlich Kommunikationsarchiv, Originalanhänge und geschützte Auth-Versandaufgaben. Prüfsummen für Artikel, Verkäufe, Mitarbeiter, Einstellungen, Lagerbewegungen, Bestellungen und Einkauf vor/nach Migration identisch. Echte neue Kundenkonten werden erst nach bestätigter E-Mail angebunden; parallele Erstaufrufe sind abgefangen.

Neuer Vercel-Serverwert: `AUTH_EMAIL_HOOK_SECRET`. Supabase-Ziel: `/api/hooks/auth-email` auf der bestehenden Produktionsdomain, E-Mail-Bestätigung bleibt eingeschaltet. Signaturwerte sind nicht im Repository enthalten.

Abnahme: 34 Fachtests, vollständige bisherige Datenbankprüfungen, neue Archiv-/Warteschlangenprüfungen, isolierte Versandarbeiterprüfung, ESLint/TypeScript/Build und Browserablauf mit temporären Supabase-Konten. Es wurden keine externen E-Mails und keine Geschäftsbuchungen erzeugt. SMTP-Verbindung ist noch durch den Inhaber zu hinterlegen.

### Bestellungen / Lieferautomatik

Vor Veröffentlichung der CRM-Erfassung Migration `202609170020_staff_orders.sql` anwenden. Der vorhandene Vercel-Cron `/api/cron/reorder` übernimmt fällige Folgeaufträge; keine zusätzliche Scheduler-Konfiguration nötig. Die neuen RPCs sind für öffentliche/authentifizierte Direktzugriffe gesperrt und prüfen intern den aktiven Mitarbeiter mit Bestellrecht. Prüfung: `node scripts/validate-staff-orders.mjs`; temporäre Browser-Fixtures ausschließlich privat speichern und anschließend entfernen.
