# Tages-/Monatsberichte und Steuerberaterzugang

Stand: 17.09.2026.

## Berichte

Unter **Finanzen** Tag oder Monat wählen und **PDF** bzw. **CSV** herunterladen. Beide Exportwege lesen dieselben gespeicherten Belegdaten serverseitig. Zeitraumgrenzen beziehen sich auf Europe/Berlin, nicht auf UTC.

PDF: A4 quer, Original-Logo, heller grüner Akzent, überwiegend weiße Flächen, kompakte Schrift, Kennzahlen und Summen, Aufteilung nach Belegart/Zahlart, Netto/Umsatzsteuer/Brutto je Steuersatz, Tagesverlauf im Monatsbericht, Tagesübersicht, Abschlussabgleich und vollständiges Belegjournal mit wiederholten Tabellenköpfen und Seitenzahlen.

Kassenbons und Lieferrechnungen werden getrennt gezeigt und einmal je Beleg summiert. Lieferrechnungen gehen nach Belegdatum ein, unabhängig davon, ob sie offen oder bezahlt sind. Offene Rechnungen sind kein Zahlungseingang; die Auswertung ist keine EÜR/Zahlungsflussrechnung. Das Kassenabschlussprotokoll wird ausschließlich mit Kassenbons verglichen. Vorhandene Abschlüsse werden durch einen Export nicht verändert. Pfand ist inklusive seiner jeweiligen Steuer enthalten und zusätzlich gesondert ausgewiesen. Rabatte sind bereits in den archivierten Positionen berücksichtigt.

CSV: UTF-8 mit BOM, Semikolon, Dezimalkomma, eine Zeile je Beleg, einheitliche Spalten ohne Zwischenüberschriften/Summenzeilen. Enthalten sind Zeitraum, Datenstatus, Exportzeitpunkt, Belegart/-nummer/-ID, UTC-Zeitpunkt und Berliner Datum, Zahlart/-status, Netto/USt./Brutto, Pfandsaldo und getrennte Beträge für 0/7/19 %. Negative numerische Werte bleiben importierbar; Textfelder werden gegen Tabellenformeln abgesichert. Die Summen ergeben sich aus den Belegzeilen und stimmen mit der PDF überein.

Es handelt sich um eine lesbare Abstimmungsunterlage für die Kanzlei, keinen DATEV-Buchungsstapel, DSFinV-K-Export oder ein Steuerformular. Aktuelle Einrichtungsdaten werden deutlich so bezeichnet; Einrichtungs- und Echtbelege werden nicht unbemerkt vermischt. Fehlerhafte Beleg-/Positionssummen verhindern den Export statt eine falsche Steuertabelle zu erzeugen.

## Zugang

Benutzername **steuerberater**, intern als regulärer Mitarbeiter mit ausschließlich `finanzen` hinterlegt. Ein separates zufälliges Passwort wird dem Inhaber übergeben und niemals im Repository, in PDFs oder im Quellcode gespeichert.

`finance_readonly=true` erlaubt Lesen, PDF-/CSV-Export sowie Abruf vorhandener Einzelbelege. Keine Buchungen, Abschlüsse, Rechnungseingangsbestätigungen, Belegfreigaben oder Mitarbeiteränderungen. Die Sperre gilt serverseitig; ausgeblendete Schaltflächen sind nur die Darstellung. Die Navigation zeigt nur freigegebene Bereiche; der Zugang landet direkt unter Finanzen. Im Mitarbeiterprofil ist **Finanzen nur lesen und exportieren** sichtbar.

Migration 018 ergänzt die Einstellung mit Standard `false`; bestehende Mitarbeiterrechte werden nicht verändert. Der neue Zugang bekommt kein Rabatt-, Kassen-, Artikel-, Kunden- oder Einstellungsrecht und keine Terminal-PIN.

## Prüfung

- Periodengrenzen in Europe/Berlin, unterschiedliche Steuersätze, Pfandrücknahmen, negative CSV-Beträge, offene Lieferrechnungen und Summenabgleich.
- PDF-Seitenformat und Logo, Monats-/Tagesmuster mit fiktiven Daten, vollständige Sichtprüfung mit Poppler.
- Rechteprüfung: Nur Finanznavigation, keine mutationsfähigen Finanzaktionen, verweigerte fremde Bereiche und APIs, erlaubte PDF-/CSV-Downloads.
- Vollständige bestehenden Fach-/Datenbanktests und Produktionsbuild.
