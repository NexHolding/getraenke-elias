# Bons und Umsatzsteuer

Stand: 17.09.2026. Prüfung des aktuellen Elias-Sortiments: 149 aktive Positionen (143 Getränke und sechs Vermietungs-/Servicepositionen); alle mit 19 % hinterlegt. Kein Milchprodukt im vorhandenen Katalog. Keine pauschale Umstellung auf 7 % und keine rückwirkende Änderung bestehender Artikel oder Belege.

## Steuerliche Zuordnung

- Regelsteuersatz 19 %: abgefülltes Mineral-/Quell-/Tafelwasser, Heilwasser, Limonaden, Cola, Schorlen, Frucht-/Gemüsesäfte, Bier (auch alkoholfrei), Wein, Sekt. Ebenso die vorhandenen Vermietungen und Kommissionsgebühr.
- 7 %: unter anderem Milch und begünstigte Milchmischgetränke mit mindestens 75 % Milch-/Milcherzeugnisanteil. Neue Artikel anhand ihrer tatsächlichen Zusammensetzung einordnen. Die Tatsache „Getränk“ allein begründet keine Ermäßigung.
- Pfandsteuer separat je Artikel; die bestehende Pfandrücknahmefunktion erfasst 19-%-Rücknahmen. Rücknahmen zu abweichenden ursprünglichen Steuersätzen benötigen eine entsprechende Erweiterung und dürfen nicht als 19-%-Rücknahme verbucht werden.

Quellen: [§ 12 UStG](https://www.gesetze-im-internet.de/ustg_1980/__12.html), [Anlage 2 UStG, insbesondere Nr. 4, 32, 34, 35](https://www.gesetze-im-internet.de/ustg_1980/anlage_2.html).

## Bedienung

Unter **Einstellungen → Steuern & Belege**: Steuernummer, gesonderte USt-IdNr., Kassenkennung und MwSt.-Vorgaben für neue Artikel/Pfand. Deutsche USt-IdNr. wird auf DE + neun Ziffern geprüft; das ersetzt keine behördliche Gültigkeitsprüfung. Die unbelegte Angabe aus dem alten Impressum wird nicht übernommen.

Neue Artikel übernehmen die Vorgaben. Dies gilt auch bei der Anlage in der Inventur. Im Artikelstamm sind Artikel- und Pfandsteuer einzeln einstellbar; über **Mehrfach bearbeiten** auch gesammelt. Die Bruttopreise bleiben bei einer Steueränderung unverändert. Netto/Umsatzsteuer werden automatisch aus dem Brutto berechnet. Bereits gespeicherte Verkaufspositionen behalten ihren ursprünglichen Steuersatz.

Der Artikeltabelle ist eine MwSt.-Spalte hinzugefügt; auch Kassenkarten, Kundensortiment und PDF-Artikelliste zeigen den Steuersatz.

## Bon

80 mm Breite, Original-Logo, Aufbau angelehnt an Aurelia Flow: Betriebsname/-anschrift, bestätigte Steuerangaben, Bonnummer, Datum/Zeit, Leistungsdatum, Kassenkennung, Bedienung, Artikel/Menge/Einzel-/Gesamtpreis, Steuerschlüssel, gesondertes Pfand, Rabatt/Grund, Zahlart, Gesamtsumme und Steuertabelle (Netto, Steuer, Brutto je Satz). Schwarze Schrift, klare Trennlinien und rechtsbündige Beträge; Inhalt bestimmt die Papierlänge. Lange Bons haben Fortsetzungsseiten und zusammenhängende Artikelblöcke. Beim Druck tatsächliche Größe / 100 % verwenden.

Migration 016 speichert Betriebsangaben in neuen Verkaufsbelegen als Datenstand zum Buchungszeitpunkt. Das Feld wird ausschließlich serverseitig aus den Einstellungen gefüllt. Spätere Änderungen beeinflussen diese Belege nicht. Bestehende Belege werden nicht nachträglich ergänzt; bei ihnen bleiben die früher fest vorgegebenen Elias-Anschriftangaben erhalten und der fehlende historische Datensatz wird kenntlich gemacht. Boninhalte sind nach Ausstellung gegen UPDATE gesperrt; der ausdrücklich autorisierte Reset des Einrichtungsmodus darf Einrichtungsbelege weiterhin löschen.

## Noch keine fiskalisierte Kasse / kein EC-Terminalbeleg

Das System besitzt weiterhin keinen eingerichteten TSE-Adapter und erzeugt eindeutig markierte Einrichtungsbelege. Migration 016 aktiviert keinen Echtbetrieb. Keine erfundenen Steuernummern, TSE-Signaturen oder EC-Autorisierungsdaten. Ein Eintrag „Karte“ dokumentiert die gewählte Zahlart, nicht eine erfolgreich autorisierte Zahlung.

Der Renderer kann bei später bereitgestellten echten Fiskaldaten Transaktionsnummer, Vorgangsbeginn/-ende, Kassen- und TSE-Seriennummer, Signaturzähler und Prüfwert ausgeben. Nicht als Test markierte Bons ohne vollständige Steuer-/Fiskaldaten werden abgewiesen. Das ist ein vorbereitetes Ausgabeformat, keine implementierte TSE-/Terminalintegration oder Zertifizierung. Pflichtangaben dürfen lesbar ausgegeben werden; es wird kein unbelegter Fiskal-QR-Code erzeugt.

Bis einschließlich 250 EUR gelten die Kleinbetragsregeln. Darüber kann ein anonymer Kassenbon keine vollständige Rechnung mit Empfängerangaben ersetzen; der Bon weist auf die gesonderte Rechnung hin. Die steuerlichen Rechnungsprozesse und gegebenenfalls E-Rechnungspflichten bleiben zu berücksichtigen.

Quellen: [§ 6 KassenSichV](https://www.gesetze-im-internet.de/kassensichv/__6.html), [§ 33 UStDV](https://www.gesetze-im-internet.de/ustdv_1980/__33.html), [§ 14 UStG](https://www.gesetze-im-internet.de/ustg_1980/__14.html).

## Prüfung

- Reale Artikelsteuersätze gelesen und gegen die Warengruppen geprüft.
- Gemischte Steuersätze, Rabatte, Pfand, Rücknahme, 100-%-Rabatt und Belegsumme geprüft.
- Datenbanktests: Vorgaben bei Artikelanlage, unveränderbare Betriebs-/Steuersnapshots und weiterhin möglicher Einrichtungsreset.
- PDF-Ausgabe mit Logo, kurzen/lange Namen und Fortsetzungsseiten gerendert; 80-mm-Format und Seitenränder geprüft.

## Ergänzung Bezahlablauf / Druck

**Bezahlen** ersetzt „Beleg erstellen“. PDF-Bons werden jetzt serverseitig unveränderlich archiviert und für Download und Epson-Ausgabe aus diesem Archiv verwendet. Vor der Erfassung einer Kartenzahlung bestätigt der Mitarbeiter die erfolgreiche Zahlung am separaten Terminal. Details: [Epson und Bezahlen](EPSON-UND-BEZAHLEN.md).
