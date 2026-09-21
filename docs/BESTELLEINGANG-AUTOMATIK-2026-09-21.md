# Bestelleingang, Bestandsbestätigung und Tourstart

## Ablauf
Neue Bestellungen nach Migration 031 werden beim Speichern unter derselben Datenbanksperre wie Kassen- und Lieferbuchungen geprüft. Ausreichend sind ausschließlich aktive Artikel mit bekanntem Lagerbestand. Verfügbar = körperlicher Lagerbestand abzüglich offener Mengen bereits bestätigter, teilweise gelieferter und laufender Lieferaufträge. Eine Bestätigung allein verändert weder Lagerbestand noch Buchhaltung.

Sind alle Positionen verfügbar, wird eine neue Anfrage sofort auf „Bestätigt“ gesetzt. Andernfalls bleibt sie offen. Der Bestelleingang zeigt angefragte/verfügbare/fehlende Mengen beziehungsweise „Bestand unbekannt“. Nach Wareneingang oder Stornierung einer anderen Zusage werden wartende Anfragen in Eingangsreihenfolge erneut geprüft: im geöffneten CRM alle zehn Sekunden sowie ohne offenen Client über den bestehenden Fünf-Minuten-Zeitplan. Wiederholungen erzeugen keine doppelten Bestätigungen oder E-Mails.

Die Zahlungsfreigabe bleibt eigenständig. Bar/EC werden übernommen. Rechnungszahlung wird nur bei einem authentifizierten, verknüpften und bereits als Rechnungskunde freigegebenen Konto automatisch übernommen. Gastanfragen erhalten durch eine passende E-Mail-Adresse keinen Rechnungskredit. Bei neuer Rechnungsanfrage ist die Ware bestätigt und reserviert, die Zahlungsart jedoch weiterhin ausdrücklich freizugeben. Kundenabos verwenden die freigegebene Kundenvorgabe; manuell erfasste Aufträge behalten die vorhandene Mitarbeiterfreigabe.

## Fenster und Sichtbarkeit
In geöffnetem CRM und dem entsprechenden App-Arbeitsbereich öffnet sich der Bestellhinweis automatisch, spätestens beim nächsten Zehn-Sekunden-Abruf. Laufende Zahlungs- und andere Dialoge werden nicht überdeckt; der Hinweis wartet bis danach. „Gesehen“ bestätigt lediglich den Hinweis und ist pro Mitarbeiterkonto dauerhaft gespeichert. Ein neuer Hinweis erscheint auch nach Anmeldung, wenn er noch ungelesen war. Ohne Bestell-/Lieferberechtigung, insbesondere im reinen Steuerberaterzugang, sind diese Kundendaten nicht zugänglich.

Dies ist ein Hinweis innerhalb des geöffneten Arbeitsbereichs, keine neue iOS-Hintergrund-Pushfunktion. Offline kann kein Soforthinweis zugesichert werden; die Meldung bleibt gespeichert und wird nach Verbindung/Anmeldung geladen.

## In Lieferung
Mangels abweichender Vorgabe wird der reale Tourstart verwendet. In Lieferplanung → „Tour starten“ wechseln die für heute geplanten, freigegebenen Aufträge automatisch auf „In Lieferung“. Datum und Fahrer werden protokolliert. Aufträge ohne Zahlungsfreigabe bleiben zurück; der Fahrer sieht die Anzahl. Wiederholtes Starten verändert bereits gestartete/abgeschlossene/stornierte Aufträge nicht. Ein bloßes Vorbereiten des Lieferscheins oder Ablaufen einer geplanten Uhrzeit behauptet keinen Versand. Laufende Touren werden nicht durch die normale Neuplanung überschrieben.

## Grenzen und Datenbestand
Bestehende Aufträge werden bei Installation nicht rückwirkend akzeptiert oder neu gemeldet. Die Reservierungsrechnung schützt neue automatische Zusagen gegen bereits zugesagte Mengen. Nachträglicher Bruch, Inventurkorrekturen oder Verkäufe können die physische Verfügbarkeit verändern; im Hinweis wird deshalb der aktuelle Bestand erneut ermittelt. Es gibt hierdurch keine zusätzliche Sperre für den Kassenverkauf reservierter Ware.

## Prüfung
Datenbanktests: ausreichender Bestand, mehrere Zusagen, Fehlmengen, unbekannte/inaktive Artikel, Teilmengen, Stornofreigabe, erneute Prüfung, Zahlungsgrenzen, dauerhafte Lesebestätigung je Mitarbeiter, Rechte/Finanzzugang, Tourstart nur heute, Wiederholungen und unveränderte Endzustände. Browser mit echten Komponenten: automatisches Fenster, Tabellen und Status, Zurückstellen hinter Zahlungsdialog, Reload ohne erneute Meldung, Zahlungsfreigabehinweis und automatischer Tourstatus. Alle finanziellen Testdaten bleiben isoliert; keine echten Kundenbestellungen oder E-Mails werden zum Test erzeugt.
