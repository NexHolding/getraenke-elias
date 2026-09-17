# TSE, Kasse und Betriebsfreigabe
Recherche: 17.09.2026. Die Quellen ersetzen keine Einzelfallprüfung durch den Steuerberater.

## Aktueller Entwicklungsstand
Die Browserkasse erzeugt ausschließlich unveränderbare Testbelege. Keine TSE-Signatur, keine reale Zahlung und keine Verkaufslagerbuchung. Test- und Finanzexporte sind ausdrücklich als TESTDATEN markiert. Eine technisch vorbereitete Kasse ist noch keine gesetzeskonform in Betrieb genommene Registrierkasse.

## Erforderlicher Fiskalablauf
1. Kassensystem und Betriebsstätte eindeutig registrieren; Kassenseriennummer und TSE-Seriennummer verwalten.
2. Zertifizierte TSE über geeigneten Anbieter anbinden. Für browserbasierte Kassen und iPad eignet sich technisch eine Cloud-TSE; ein konkreter Anbieter, dessen Zertifikatsgültigkeit und Betriebsbedingungen müssen bestätigt werden.
3. Aufzeichnungspflichtigen Vorgang zu dessen Beginn starten, Änderungen nachvollziehbar verarbeiten, Vorgang abschließen oder einen Abbruch ordnungsgemäß dokumentieren. Nicht erst beim Druck eine Signatur simulieren.
4. TSE-Antwort einschließlich Transaktionsnummer, Signaturzähler, Prüfwert, Start/Ende und Seriennummern unverändert speichern. Fehler, Verbindungsabbrüche und Wiederholungen müssen einen eindeutig rekonstruierbaren Zustand hinterlassen.
5. Beleg aus dem gesicherten Geschäftsvorfall erzeugen, Papierbeleg oder elektronische Ausgabe mit Einverständnis.
6. TSE-Exporte, DSFinV-K-Daten, Kassenbuch, Einlagen/Entnahmen, Stornos, Zählprotokolle, Zahlarten, Pfand und Abschlüsse zusammenführen und unveränderbar archivieren. Ein CSV mit Umsatzzahlen ist kein DSFinV-K-Export.
7. Verfahrensdokumentation, Rollen, Berechtigungen, Datensicherung, Wiederherstellung, Aufbewahrung und Ausfallverfahren einrichten und abnehmen.

## Pflichtangaben auf Belegen
Nach § 6 KassenSichV sind insbesondere vollständiger Unternehmername/Anschrift, Ausstellungsdatum, Vorgangsbeginn/-ende, Mengen/Art der Leistungen, Transaktionsnummer, Entgelt und Steuerinformationen, Kassen- und TSE-Seriennummer, Prüfwert und Signaturzähler erforderlich. Zulässige Darstellungen umfassen die lesbare Ausgabe oder den vorgeschriebenen DSFinV-konformen QR-Code. Zusätzliche umsatzsteuerliche Anforderungen gelten abhängig von Beleg-/Rechnungsart und Betrag.

Die Umsetzung muss Netto/Brutto und Steuer nach Steuersätzen ausweisen; Pfandausgabe und Rücknahme sind separate Positionen und dürfen nicht pauschal als steuerfreier Durchlaufposten behandelt werden. Konkrete Pfandsteuer und Buchungskonten sind mit dem Steuerberater abzustimmen. Die 19-%-Voreinstellung ist eine zu prüfende Importvorgabe, keine Artikelklassifizierungsgarantie.

## Meldung an das Finanzamt
Die Mitteilung nach § 146a Abs. 4 AO erfolgt über Mein ELSTER bzw. ERiC. Für neu angeschaffte meldepflichtige Systeme gilt nach den veröffentlichten Regelungen seit 1. Juli 2025 grundsätzlich eine Monatsfrist. Änderungen/Außerbetriebnahme und die jeweiligen Betriebsstätten sind zu berücksichtigen. Die Verantwortlichkeit verbleibt beim Steuerpflichtigen. Eine TSE sendet nicht einfach jeden Bon direkt ans Finanzamt.

## Mögliche Anbieterarchitektur
fiskaly bietet getrennte APIs für SIGN DE, DSFinV-K, Archivierung und Mitteilungen. Eine SIGN-DE-Anbindung allein deckt nicht alle Kassensystempflichten ab. Vor Implementierung des Echtbetriebs: Vertrag, Sandbox-Zugang, Live-Zugang, Kassenanzahl, Zertifikatsstatus, Datenstandort, Ausfallszenarien und Kosten klären. Es wurden keine Verträge abgeschlossen und keine TSE kostenpflichtig aktiviert.

## Drucker / iPad
- Aktuell: 80-mm-Testbon als PDF; Ausdruck über den Systemdruckdialog bzw. ein kompatibles Druckziel.
- Epson: ePOS SDK for JavaScript für geeignete Netzwerkdrucker; ePOS SDK für native iOS-Anwendungen. Exaktes Modell, Firmware, HTTPS/Zertifikate und Netzwerkzugang prüfen.
- Star: eigenes SDK/geeignete Druckerschnittstelle; nach Modellwahl konkretisieren.
- Ein beliebiger Bluetooth-Bondrucker ist nicht automatisch aus Safari steuerbar. Die native iPad-App benötigt das passende SDK und eine Hardwareprüfung.
- Papierbreite, Umlaute, Eurozeichen, QR-Code, Papierschneider, Papiermangel, Offlinebetrieb und Wiederholungsdruck mit Kopiekennzeichnung prüfen.

## Noch vor regulärem Betrieb erforderlich
- Artikelpreise als Laden-/Lieferpreise trennen bzw. bestätigen; EAN und Sammelsorten auflösen, Istbestand und Pfand erfassen.
- Echten Lieferanten und Bestellprozess abnehmen. Demo-Lieferant darf nie Versand auslösen.
- SMTP-Zugang, Absenderdomain/SPF/DKIM/DMARC und Empfänger prüfen.
- Domain-DNS und Vercel-Zuordnung im Einverständnis des Domaininhabers umstellen.
- Unplausible USt-ID des Alt-Impressums korrigieren; Impressum/Datenschutz, Auftragsverarbeitung und Löschkonzept finalisieren.
- Vollständige Fiskalisierung einschließlich DSFinV-K, Archivierung, Storno/Retouren, Kassensturz, Einlagen/Entnahmen und Wiederanlauf umsetzen und mit Steuerberater/Anbieter abnehmen.
- Anschließend native Kunden-App und iPad-Kassen-App entwickeln, Apple-Signierung und Verteilung festlegen.

## Primärquellen
- § 6 KassenSichV: https://www.gesetze-im-internet.de/kassensichv/__6.html
- § 2 KassenSichV: https://www.gesetze-im-internet.de/kassensichv/__2.html
- BMF, FAQ Kassengesetz, Stand 29.04.2026: https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html
- BMF, Mitteilungsverpflichtung: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2024-06-28-mitteilungsverpflichtung-nach-AO.html
- fiskaly Produkt-/API-Dokumentation: https://workspace.fiskaly.com/ und https://workspace.fiskaly.com/api/
- Epson ePOS SDK: https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html
