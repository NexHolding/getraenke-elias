# Rabatte in der Kasse

In **Kasse → Aktueller Bon → Rabatt** stehen drei Optionen zur Verfügung:

- **Kein Rabatt**: normale Artikelpreise.
- **Einzelartikel**: pro Warenkorbposition einen Prozentsatz von 0 bis 100 und einen Grund wählen. Der Nachlass gilt für alle Einheiten dieser Position.
- **Warenkorb**: einen Prozentsatz von 0 bis 100 auf alle Warenpositionen anwenden; Grund auswählen.

Artikel- und Warenkorbrabatt werden nicht kombiniert. Beim Wechsel der Rabattart werden die bisher eingegebenen Rabatte gelöscht. Nach einem abgeschlossenen oder geleerten Bon startet der nächste Einkauf ohne Rabatt. Pfand und Pfandrücknahmen werden nicht rabattiert. Preise werden je Verkaufseinheit auf ganze Cent gerundet; Kasse, Server, Bon und Steuerauswertung verwenden dieselben rabattierten Centpreise.

Gründe: kurzes Mindesthaltbarkeitsdatum, beschädigte Verpackung, Aktion, Kulanz, Mengenrabatt oder sonstiger Preisnachlass. Ursprünglicher Preis, gewährter Prozentsatz, Geltungsbereich und Grund werden mit den Belegpositionen gespeichert. Der Bon zeigt Nachlass und ursprünglichen Warenwert; die Rabattsumme ist bereits im Zahlbetrag berücksichtigt. Netto und Umsatzsteuer basieren auf dem rabattierten Warenpreis, Pfand wird separat gerechnet.

Unter **Einstellungen → Mitarbeiter → Mitarbeiterprofil** lässt sich **„Rabatte auf Artikel und Warenkorb vergeben“** aktivieren oder entziehen. Das Recht allein gewährt keinen Kassenzugang. Inhaber besitzen es immer. Migration 015 aktiviert ausschließlich dieses zusätzliche Recht für alle zum Migrationszeitpunkt vorhandenen Mitarbeiter; sonstige Rechte und Aktivstatus bleiben unverändert. Auch bei neu angelegten Mitarbeitern ist der Haken vorbelegt; der Inhaber kann ihn vor dem Speichern entfernen.

Die bisherige Einstellung `discount_percent` ist als **Rabattvorschlag für den Warenkorb (%)** erhalten. Sie ist keine Rabattobergrenze. Der vorgeschlagene Prozentsatz kann im jeweiligen Bon geändert werden.

Die Berechtigung wird sowohl in der API als auch in der Datenbank geprüft. Direkte manipulierte Anfragen ohne Rabattrecht sowie negative/überhöhte und kombinierte Rabatte werden abgewiesen. Ein erneuter Aufruf derselben abgeschlossenen Bon-ID erzeugt keine zweite Buchung und keine zweite Bestandsminderung. Die bestehende Sperre für nicht eingerichteten TSE-Echtbetrieb bleibt bestehen.

Prüfungen: `npm test`, `npm run test:db` (einschließlich `scripts/validate-discounts.mjs`), TypeScript, ESLint, Produktionsbuild, Desktop-/Tablet-Browserprüfung und gerenderte Beispielbons mit Zeilenumbrüchen und Folgeseiten.
