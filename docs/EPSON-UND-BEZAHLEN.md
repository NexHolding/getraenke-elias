# Bezahlablauf und Epson-Bondruck

Aktueller Stand vom 21.09.2026: Native iOS-App mit Netzwerkbrücke vorhanden, vorgesehenes Gerät Epson TM-m30II; reale Druckeradresse und bestätigter Hardwaretest fehlen weiterhin. [Aktuelle Prüfung](KASSEN-RECHTSPRUEFUNG-2026-09-21.md) hat Vorrang vor dem folgenden historischen Entwicklungsstand.

Stand: 17.09.2026. Ergänzung zur vorhandenen Web-/iPad-Oberfläche; keine native iOS-App und keine TSE-Aktivierung.

## Bedienung

1. Artikel, Rabatte, Pfandrücknahmen und Zahlart wählen. Bei Karte muss der Mitarbeiter die erfolgreiche Zahlung/Erstattung am separaten Terminal bestätigen; eine Änderung des Warenkorbs hebt diese Bestätigung auf.
2. **Bezahlen** bucht den Vorgang und Lagerabgang über die bestehende atomare `save_sale`-Funktion. Eine vor dem Senden lokal gespeicherte Vorgangs-ID verhindert bei Wiederholung eine zweite Buchung. Doppelklicks werden gesperrt.
3. Der 80-mm-Bon mit Logo wird serverseitig als PDF archiviert. Er enthält die unveränderbaren Betriebs-, Artikel-, Steuer- und gegebenenfalls Fiskalsnapshots des Verkaufs. Ein SHA-256-Prüfwert wird beim Abruf kontrolliert; direkte Änderungen/Löschungen des Archivs sind gesperrt. Der autorisierte Reset von Einrichtungsbelegen kann weiterhin kaskadierend löschen.
4. **Bon erwünscht?** → **Ja** sendet das archivierte Dokument direkt an den auf diesem Tablet eingerichteten Epson, ohne Systemdruckdialog. Erst eine gültige Epson-Erfolgsantwort wird als bestätigter Ausdruck dokumentiert. Der Mitarbeiter bietet das Papier dem Kunden an.
5. **Nein · digital anbieten** verlangt Zustimmung zur elektronischen Ausgabe. Ein QR-Code öffnet den gespeicherten PDF-Bon. Der nicht erratbare Link ist 30 Tage gültig; die interne Archivierung läuft unabhängig davon weiter. Anschließend bestätigt der Mitarbeiter das Angebot des Digitalbons. Es handelt sich um einen Download-QR, nicht um einen TSE-/Fiskal-QR.
6. Bei einer Druckerstörung kann die PDF bewusst manuell gedruckt werden. Erst die ausdrückliche Bestätigung des tatsächlich gedruckten und angebotenen Papierbons schließt diese Ersatzausgabe ab. Sie wird als `manual_pdf`, nicht als Epson-Bestätigung dokumentiert.

Ein Druck- oder Archivfehler löst niemals eine neue Zahlung aus. Nicht abgeschlossene Belegausgaben erscheinen beim erneuten Öffnen der Kasse für denselben Mitarbeiter wieder. Archivfehler werden im Belegdialog nachbearbeitet, während die bereits erfolgte Buchung bestehen bleibt. Ein HTTP-Abbruch während der Buchung wird mit derselben Vorgangs-ID und demselben Inhalt erneut geprüft. Die lokale Wiederaufnahme gilt für denselben Browser-Tab; bereits verbuchte offene Ausgaben werden zusätzlich serverseitig geführt.

Druckversuche haben eigene IDs und Status `sending`, `confirmed`, `failed`, `unknown`. Bei fehlender Antwort kann bereits Papier ausgegeben worden sein. Deshalb kein automatischer Wiederholungsdruck: Gerät kontrollieren und Kopie ausdrücklich bestätigen. Noch laufende Aufträge sperren weitere Versuche für zwei Minuten. Erneute Ausdrucke tragen **KOPIE / ERNEUTER AUSDRUCK**. Ausgabeaktionen werden mit Mitarbeiter und Zeitpunkt protokolliert.

## Assistent unter Einstellungen → Bon-Drucker

1. **Gerät:** Epson-TM-Modell mit ausdrücklich unterstütztem ePOS-Print XML und LAN/WLAN, z. B. TM-m30III; 80-mm-Papier. Die Modellangabe allein prüft keine Kompatibilität.
2. **Netzwerk:** Tablet und Drucker im selben lokalen Netz, kein isoliertes Gastnetz, feste Adresse/DHCP-Reservierung. In Epson Web Config ePOS aktivieren und Druck-Spooler ausschalten. HTTPS-Zertifikat vertrauenswürdig auf dem Tablet installieren bzw. gültiges passendes Zertifikat bereitstellen. Hostname muss zum Zertifikat passen; Firmware und Epson-Handbuch beachten.
3. **Verbindung:** vollständige `https://…`-Adresse ohne Pfad/Zugangsdaten, Gerätekennung standardmäßig `local_printer`, modellabhängig 576 oder 512 Druckpunkte. Lokalen Netzwerkzugriff im Browser erlauben. Ein leerer ePOS-Auftrag liest den Status, ohne Papier oder Schnitt auszulösen.
4. **Testdruck:** Testbon mit Logo, Umlauten und Papierschnitt. Nach Epson-Antwort muss ein Mitarbeiter den tatsächlich lesbaren Ausdruck bestätigen. Erst danach **Epson aktivieren & speichern**. Die erfolgreiche Sichtprüfung wird pro Browser/Gerät gespeichert. Geänderte Adresse, Gerätekennung oder Druckbreite erfordern eine neue Prüfung.

Keine automatische Suche im Laden-Netzwerk, keine Zertifikatsumgehung, kein Cloud-Zugriff auf private Drucker-IP-Adressen. Die Kommunikation läuft direkt vom Kassentablet zum Drucker. HTTPS-Vertrauen, CORS und lokale Browser-Netzwerkfreigabe müssen am konkreten Gerät funktionieren. Ein bloßer HTTP-200-Status oder ein nur eingereihter Spoolerauftrag gilt nicht als bestätigter Ausdruck.

Für USB/Bluetooth und eine spätere native iPad-App ist eine modellabhängige Integration des Epson ePOS SDK for iOS nötig. Die bestehende Netzwerk-Implementierung behauptet keine USB-/Bluetooth-Unterstützung und keine native App-Fertigstellung.

## Technische Umsetzung

- Migration **017**: `receipt_documents`, `receipt_workflows`, `receipt_print_jobs`; RLS, keine anonymen/angemeldeten direkten Tabellenrechte; serverseitige Mitarbeiter-/Modulprüfung, atomarer Workflow bei Verkaufsanlage, Sperren und protokollierte Ausgabeaktionen. Keine Anpassung bestehender Verkäufe, Bestände, Steuersätze oder des Einrichtungsstatus.
- Private API `/api/receipts/[id]`: gespeicherter Beleg und Status; Ausgabeaktionen. Berechtigt sind der aktive ursprüngliche Kassierer oder berechtigte Finanzmitarbeiter/Inhaber. Archivierte Belege bleiben getrennt von aktuellen Betriebs-/Artikeländerungen.
- Öffentliche API `/api/bon/[token]`: ausschließlich freigegebener Beleg nach Zustimmung, zufälliger 64-stelliger Zugriffslink, befristet, keine Auflistung, `no-store`, `noindex`, `nosniff`. Link nur dem zugehörigen Kunden zeigen. Keine Übertragung von Drucker- oder Mitarbeiterzugangsdaten.
- PDF.js rendert die archivierten PDF-Seiten. Epson erhält zeilenweise monochrome 1-Bit-Rasterdaten (MSB zuerst, schwarz=1), keine fälschlich als Rohdaten deklarierten PNG-Dateien. Worker/Standardschriftdateien werden aus der gelockten Abhängigkeit beim Build lokal bereitgestellt.
- Dokumentierter SOAP-Endpunkt `/cgi-bin/epos/service.cgi?devid=…&timeout=60000`; XML-Namensraum `http://www.epson-pos.com/schemas/2011/03/epos-print`. Ein Auftrag enthält Rasterbilder, Vorschub und abschließenden Schnitt.
- Druckdaten werden konservativ auf 1,9 MB begrenzt (moderne TM-Modelle ab 2 MB Auftragskapazität; TM-m30III laut Handbuch 4 MB). Überlange Bons werden vor dem Senden zur PDF-Ersatzausgabe verwiesen. Ältere TM-i-Controller mit kleineren Limits benötigen eine eigene Modellanpassung.
- Zeitüberschreitungen oder ungültige Antworten bleiben unklar; kein `no-cors` und keine simulierte Erfolgsmeldung. `JobSpooling` wird ausdrücklich nicht als abgeschlossener Druck bewertet.

## Rechtliche Einordnung und Betriebsgrenzen

Die Belegausgabepflicht verlangt Erstellung und Angebot des Belegs. Kunden müssen den Bon nicht mitnehmen. Elektronische Ausgabe setzt Zustimmung voraus; ein QR-Download ist möglich. Deshalb darf **Nein** nicht den Beleg oder dessen Angebot ersatzlos entfallen lassen. Ein reines Anzeigen auf dem Kassendisplay ohne Download reicht nicht.

Die Kasse bleibt im **Einrichtungsmodus**. Weder Epson noch die neue Archivierung ersetzen TSE, DSFinV-K, Verfahrensdokumentation, Datensicherung oder die noch ausstehende Inbetriebnahme/Abnahme. Steueridentität und TSE-Zugang sind weiterhin nicht vollständig vorhanden. Echte Kartenautorisierung erfolgt weiterhin am separaten Kartenterminal. Die vorhandenen Einrichtungsbelege bleiben sichtbar so gekennzeichnet.

## Verifikation

- Rechen-/Validierungstests einschließlich Epson-URL, SOAP-Status und Rasterbitfolge.
- PGlite mit allen Migrationen: einmaliger Lagerabgang, atomare offene Ausgabe, geschütztes Archiv, Mitarbeiterrechte, Wiederholungs-/Parallelauftrag, Timeout, bestätigte Kopie, Zustimmung, Digitalangebot, manuelle Ersatzausgabe, Einrichtungsreset und RLS.
- Browser mit tatsächlichem PDF.js-Rasterizer und simuliertem Epson: Assistent, leerer Statusauftrag, Logo-Testbon, Aktivierung, Doppelklick, Druckabbruch/Neuladen/Kopie, Kartenbestätigung, verlorene Buchungsantwort/idempotente Wiederholung, QR-Code und Tablet-Oberfläche ohne JavaScript-Fehler. Script: `node --import tsx scripts/verify-checkout-browser.mjs` gegen lokalen Produktionsbuild auf Port 3017. Das Script mockt Geschäftsdaten und Drucker; es nutzt einen temporären Inhaber-Login und beendet ihn wieder.
- **Kein physischer Epson und kein echtes iPad vorhanden:** Modell, Schnittstelle, Zertifikatsinstallation, Papierqualität, Firmware, Schnitt und Safari-/Netzwerkfreigabe müssen vor Ort mit dem Assistenten bestätigt werden. Kein Hardware-Erfolg wird vorweggenommen.

## Offizielle Quellen

- [Epson ePOS-Technologie und SDK-Überblick](https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html)
- [Epson ePOS-Print XML User’s Manual, Revision AF](https://files.support.epson.com/pdf/pos/bulk/epos-print_xml_um_en_rev_af.pdf)
- [Epson TM-m30III Technical Reference Guide, Revision F](https://files.support.epson.com/pdf/pos/bulk/tm-m30iii_trg_en_revf.pdf)
- [BMF: FAQ zur Belegausgabepflicht](https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html)
- [AEAO zu § 146a, elektronische Belege](https://ao.bundesfinanzministerium.de/ao/2025/Abgabenordnung/Vierter-Teil/Zweiter-Abschnitt/Erster-Unterabschnitt/Paragraf-146a/ae-146a.html)
- [§ 146a AO](https://www.gesetze-im-internet.de/ao_1977/__146a.html)
