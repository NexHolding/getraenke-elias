# Rechnungen und Lieferscheine – Gestaltung und Zahlungs-QR

## Umsetzung

Neue PDFs verwenden das Elias-Logo, eine helle grüne Akzentfarbe, großzügige Ränder, wiederkehrende Kopf-/Fußzeilen und Seitenzahlen. Rechnungen zeigen Empfänger, eindeutige Belegnummer, Rechnungsdatum, tatsächliches Liefer-/Leistungsdatum und Lieferscheinreferenz. Tabellen trennen Waren, Pfand und negative Pfandrücknahmen. Brutto-Einzelpreise und Brutto-Positionswerte sind ausdrücklich beschriftet; die Steuerübersicht enthält Netto, Umsatzsteuer und Brutto pro Steuersatz. Alle Steuergruppen werden aus den gespeicherten Positionen einschließlich individueller Pfandsteuern berechnet und mit den gebuchten Gesamtwerten abgeglichen. Abweichende Summen verhindern die Neugenerierung.

Lieferscheine zeigen bestellte, tatsächlich gelieferte und offene Mengen, zurückgenommenes Leergut, den verbleibenden Zahlbetrag, Zahlungsart und den dokumentierten Empfang einschließlich vorhandener Unterschrift. Sie sind ausdrücklich keine Rechnung. Entwürfe und Einrichtungsbelege sind gekennzeichnet.

Unter **Einstellungen → Rechnungen & Bank** stehen Kontoinhaber, IBAN, optionale Bank und BIC bereit. IBAN wird normalisiert und mit Länderformat/Prüfsumme geprüft; für SEPA-Konten außerhalb des EWR wird BIC verlangt. Die formale Validierung prüft weder Kontoinhaberschaft noch Erreichbarkeit des Kontos.

Neue offene Rechnungen im Echtbetrieb mit positivem Betrag und gültiger Bankverbindung enthalten einen EPC-SEPA-QR: `BCD / 002 / UTF-8 / SCT`, Fehlerkorrektur M, maximal Version 13 und 331 Bytes. Empfänger, IBAN, BIC (falls hinterlegt), exakter Betrag und Rechnungsnummer als Verwendungszweck stehen zusätzlich lesbar auf der Rechnung. Keine Überweisungsaufforderung bei Einrichtungsbelegen, bereits bei Ausstellung bezahlten Rechnungen, Nullbeträgen oder Auszahlungen. Ein ursprünglich offener archivierter Beleg bleibt nach Zahlung unverändert; deshalb enthält er den Hinweis, bereits beglichene Beträge nicht erneut zu überweisen. Der aktuelle Zahlungsstatus wird im Portal geführt.

Migration **202609170036** speichert Lieferdatum, Lieferscheinnummer und Bankverbindung beim Anlegen neuer Rechnungen. Gebindegröße und Flaschenvolumen werden beim Anlegen neuer Aufträge aus dem Artikel übernommen und anschließend in den Liefer-/Rechnungspositionen bewahrt. Bestehende Daten werden nicht umgeschrieben. Archivierte PDF-Originale und bereits versendete Originalanhänge haben weiterhin Vorrang. Fehlende Leistungsdaten in noch nicht archivierten Altbelegen werden aus dem zugehörigen gespeicherten Lieferschein gelesen, nicht aus dem Rechnungsdatum abgeleitet.

## Rechtliche Einordnung und offene Einrichtung

Die Standardrechnung berücksichtigt § 14 Abs. 4 UStG für die normalen inländischen Getränkelieferungen: vollständige Namen/Anschriften, Steueridentität des Ausstellers, Datum und Nummer, Art und Menge, Leistungsdatum und Steueraufteilung. Das System lässt keine neuen Echt-Rechnungs-PDFs ohne Aussteller, Anschrift und Steueridentität zu. Das ersetzt keine Prüfung der inhaltlich richtigen Stammdaten oder der steuerlichen Einordnung des einzelnen Produkts. Steuerbefreiungen, Reverse Charge und andere Sonderfälle benötigen eigene Angaben und sind mit dieser Standardvorlage nicht abgedeckt.

**Live-Prüfung 21.09.2026:** Kontoinhaber und IBAN sind noch nicht hinterlegt; es fehlt eine bestätigte Steuernummer bzw. formal gültige deutsche USt-IdNr. Das System läuft unverändert im Einrichtungsmodus. Diese Angaben müssen vom Inhaber in den Einstellungen ergänzt werden. Die bestehende gesonderte TSE-/Echtbetriebsfreigabe bleibt erforderlich. Keine erfundenen Daten und keine Test-Bankverbindung wurden produktiv gespeichert.

Ein PDF mit Banking-QR ist **keine strukturierte E-Rechnung** nach EN 16931. Für B2C besteht die neue B2B-E-Rechnungspflicht nicht. Bei inländischem B2B gelten die gesetzlichen Übergangsfristen; im Jahr 2026 kann im Rahmen der allgemeinen Übergangsregelung weiterhin eine sonstige Rechnung verwendet werden, elektronische PDFs mit Zustimmung des Empfängers. Eine spätere verpflichtende B2B-E-Rechnung benötigt beispielsweise XRechnung oder ZUGFeRD; dieser Export ist nicht Bestandteil der Layoutänderung.

## Nachweise

- 73 TypeScript-Tests erfolgreich, inklusive EPC-Feldstruktur, Euro-Cent-Grenzen, ungültiger IBAN/BIC, Zeilenumbruch-Injektion und Bankfeld-Validierung.
- Gesamte Datenbank-Testpipeline erfolgreich: Auslieferung, Teillieferung, Pfandrücknahme, gemischte Steuergruppen, Auszahlung/Nullbetrag, unveränderliche Rechnungen, Mail-Archiv und Berechtigungen. Zusätzliche Prüfung der eingefrorenen Bankdaten und des Lieferdatums.
- Lokaler Produktionsbuild, TypeScript und ESLint erfolgreich.
- Einstellungen im Chrome-Browser für Desktop und iPad-Größe geprüft; Speichern über abgefangene API, keine realen Bankdaten verändert. Keine JavaScript-Fehler oder horizontales Überlaufen.
- Ein- und mehrseitige PDFs gerendert und visuell geprüft. Der QR wurde unabhängig mit jsQR aus der gerenderten Rechnung zurückgelesen; IBAN, Betrag 91,21 EUR und Verwendungszweck stimmen überein.
- Migration produktiv angewendet; Prüfsummen von bestehenden Rechnungen, Lieferscheinen, Verkäufen, Kunden, Produkten, Bestandsbewegungen und Einstellungen vor/nach Migration identisch. Während des Prüfzeitraums lief die vorhandene Bestellautomatik; Aufträge und zugehörige Kommunikationswarteschlangen sind deshalb nicht unverändert. Keine Testzahlungen gebucht und keine Test-E-Mails versendet.
- Muster-PDFs unter `output/pdf/` enthalten ausdrücklich Musterangaben und sind keine echten Rechnungen. Reproduzierbar mit `node --import tsx scripts/validate-document-design.mts`.

## Quellen

- Pflichtangaben: https://www.gesetze-im-internet.de/ustg_1980/__14.html
- EPC069-12 v3.1: https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/quick-response-code-guidelines-enable-data-capture-initiation
- BMF-FAQ E-Rechnung: https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html
- Layoutanregung (Logo, Tabellen, Geschäftsdaten): https://help.lexware.de/de-form/articles/548593-mehrere-drucklayouts-erstellen-und-verwenden
