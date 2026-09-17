# Kundenbestellungen und Lieferautomatik im CRM

Unter **Bestellungen → Bestellung anlegen** können Inhaber und Mitarbeiter mit dem Modulrecht **Bestellungen** für bestehende Kunden bestellen. Ein Kundenlogin ist dafür nicht erforderlich. Das geschützte Systemkonto bleibt aus der Kundenauswahl ausgeschlossen; reine Finanzzugänge haben keinen Zugriff.

1. Kunden über Name, Kundennummer, E-Mail oder Adresse suchen und auswählen. Telefon und vollständige Lieferadresse müssen im Kundenprofil gepflegt sein.
2. Artikel suchen, Gebinde und Mengen wählen. Angezeigt werden aktuelle Bruttopreise, Umsatzsteuer und Pfand; die Gesamtsumme enthält Pfand. Im CRM sind auch individuelle Bestellungen unterhalb der Online-Mindestmenge möglich.
3. Ersten Liefertermin ab heute wählen, Lieferhinweise ergänzen und bei Bedarf das Intervall einstellen: wöchentlich, zweiwöchentlich, monatlich, vierteljährlich, halbjährlich oder jährlich.
4. **Bestellung verbindlich anlegen** erstellt einen bestätigten Auftrag. Die Artikelpreise und Adressdaten werden auf dem Server aus den Stammdaten übernommen. Der erste Auftrag wird sofort angelegt; bei wiederkehrender Lieferung beginnt die Automatik mit dem Folgetermin.

## Automatik verwalten

Der Abschnitt **Lieferautomatiken** zeigt Kunde, Artikel, Intervall, nächsten Termin, Status und mögliche Ausführungsfehler. Bearbeiten erlaubt Änderungen an Mengen, Artikeln, Hinweisen, Intervall und nächstem Termin. Pausieren stoppt Folgeaufträge. Zum Fortsetzen einen heutigen oder zukünftigen Termin wählen. Bereits erzeugte Bestellungen bleiben erhalten und müssen bei Bedarf separat storniert werden.

Der vorhandene stündliche Vercel-Cron `/api/cron/reorder` erzeugt fällige Folgeaufträge. Preise, Steuersätze, Pfand und Kundendaten werden zum Zeitpunkt der Auftragserzeugung neu aus den Stammdaten übernommen. Der Kalendertag bleibt bei Monatsintervallen erhalten: 31. Januar → 28. Februar → 31. März. Bei längerer Unterbrechung wird einmal der zuletzt fällige Termin nachgeholt, nicht eine Serie alter Lieferungen auf einmal. Inaktive Artikel oder fehlende Lieferdaten blockieren das betroffene Abo mit sichtbarer Meldung; andere Abos laufen weiter.

## Verarbeitung und Schutz

- Bestellanlage und gegebenenfalls Lieferabo entstehen in einer Datenbanktransaktion. Wiederholte Übermittlung derselben Bestellkennung erzeugt keinen zweiten Auftrag.
- Bestellanlage verändert weder Lagerbestand noch Kassenumsatz. Lagerabgang, Lieferschein und Rechnung bleiben im bestehenden Lieferabschluss.
- Die gewünschte Lieferung ist von der tatsächlich geplanten Tour getrennt. Automatische und manuelle Tourenplanung ziehen zukünftige Termine nicht vor; Liefertage und Kundenzeitfenster gelten weiterhin.
- Änderungen an Abos verwenden eine Revisionsprüfung; zwischenzeitliche Änderungen erfordern Neuladen. Ersteller und Änderungen sind im Auditprotokoll nachvollziehbar.
- Bestellbestätigungen verwenden bei aktivierter SMTP-Schnittstelle den vorhandenen E-Mail-Ausgang samt Kommunikationsarchiv. Ohne SMTP wird kein tatsächlicher Versand behauptet.

## Migration und Prüfung

Migration `202609170020_staff_orders.sql` ergänzt Auftragsherkunft, gewünschten Liefertermin, Abo-Revisionsstand, Hinweise, Kalenderanker und Fehlerstatus. Sie ergänzt ausschließlich serverseitig ausführbare Funktionen mit Mitarbeiterprüfung. Bestehende Geschäftsbuchungen bleiben unverändert.

Prüfungen: `npm test`, `npm run test:db`, `node scripts/validate-staff-orders.mjs`, Lint und Produktionsbuild. Der Browsertest `scripts/verify-staff-orders-browser.mjs` verwendet ausschließlich private, temporäre QA-Fixtures, prüft Mitarbeiter- und Inhaberbestellungen, Abo-Pause/Bearbeitung/Fortsetzung, doppelte Übermittlung, Rechte und Tablet-/Mobilansicht. Er löscht eigene QA-Aufträge und Abos wieder; er sendet keine E-Mails und bucht keine Warenbewegungen.
