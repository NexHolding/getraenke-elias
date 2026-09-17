# Veröffentlichung vom 17.09.2026

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
