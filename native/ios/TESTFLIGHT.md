# TestFlight · beide Elias-Apps

Aktualisierung 21.09.2026: **Elias Kasse 0.1.0 (Build 2)** ist verarbeitet, der Gruppe „Elias interne Abnahme“ zugewiesen und **Im Test**. Enthält iPad-Vollbild, Scanner-/Druckerzugriff über die Kassen-Kopfzeile und verwendet den neuen Web-Arbeitsplatz mit Kategorie → Marke → Variante sowie festem Bon rechts. Build-ID: `fb4a3688-361d-463e-b19e-6475a296414f`. Für Kasse den nächsten Upload mit Buildnummer **3 oder höher** erstellen. Die Kunden-App bleibt unverändert auf Build 1.

Vorheriger Stand 21.09.2026: Beide Apps wurden mit Xcode 26.3 signiert und erfolgreich zu App Store Connect hochgeladen: **Version 0.1.0 (Build 1)**. Apple-Team: **Chris Neve (`LCYUVY9ZZ4`)**. Die abgelaufene Xcode-Anmeldung wurde erneuert. Beide Upload-Kommandos endeten mit `EXPORT SUCCEEDED`; Apple hat beide Builds verarbeitet. TestFlight-Beschreibungen und Datenschutz-URL sind hinterlegt.

| App | Apple-ID | App Store Connect |
|---|---|---|
| Getränke Elias | 6814398025 | [Kunden-App](https://appstoreconnect.apple.com/apps/6814398025/distribution) |
| Elias Kasse | 6814398531 | [Kassen-App](https://appstoreconnect.apple.com/apps/6814398531/distribution) |

Geprüfter Benutzerkreis: ausschließlich der bestehende Accountinhaber/Administrator Chris Neve. Dieser wurde auf ausdrücklichen Wunsch als interner Tester beider Apps hinzugefügt; keine weiteren Apple-Benutzer angelegt. Je App ist die Gruppe „Elias interne Abnahme“ mit manueller Build-Zuweisung eingerichtet, automatische Verteilung ist ausgeschaltet.

Verbunden erkannt: iPhone 17 Pro Max und iPad Pro 12,9 Zoll (4. Generation). Auf dem iPad ist der Entwicklermodus für direkte Xcode-Tests noch deaktiviert. App Store Connect bestätigt inzwischen die Installation von Kassen-Build 1 auf dem iPad Pro. Build 2 ist jetzt als Update verfügbar; dessen Installation ist noch nicht bestätigt.

## Festgelegter Umfang

- **Getränke Elias** (`de.getraenkeelias.kunden`): iPhone/iPad ab iOS 17, Lieferanfragen. Onlinezahlung folgt später.
- **Elias Kasse** (`de.getraenkeelias.kasse`): iPad Pro mit iPadOS 17 oder neuer. Bar/Karte im CRM erfassen; das separate SumUp-EC-Gerät wird nicht angesteuert. Eine Kartenbuchung in Elias bestätigt keine Zahlung am SumUp-Gerät; diese muss der Mitarbeiter zuvor am Terminal prüfen.
- Bondrucker **Epson TM-m30II**, vorbereiteter ePOS-HTTPS-Netzwerktransport. Anschlussvariante, Zertifikat und echter Testdruck noch abnehmen. Keine Bluetooth-/USB-Anbindung in diesem Build.
- Push-Konzept in [PUSH-KONZEPT.md](PUSH-KONZEPT.md); noch keine aktive APNs-Funktion.

## Veröffentlichung

1. **Erledigt:** Xcode-Anmeldung erneuert. Team `LCYUVY9ZZ4` ist im Projekt zugeordnet; beide Bundle-IDs sind registriert.
2. **Erledigt:** Zwei iOS-App-Datensätze mit obigen Bundle-IDs, Deutsch als Hauptsprache und SKUs `elias-kunden-ios`, `elias-kasse-ios` sind angelegt.
3. **Build 1 ist bereits hochgeladen.** Kassen-Build 2 ist ebenfalls hochgeladen. Für den nächsten Kassen-Upload mindestens Buildnummer 3 verwenden; zuvor App Store Connect prüfen.
4. Signieren und hochladen. Das Script verwendet das Xcode-Konto und dessen automatische Signierung; es enthält keine Zugangsdaten und speichert Ausgaben unter dem ignorierten `output/ios/`.

```sh
# Vorprüfung ohne Team, ohne Upload:
python3 native/ios/Scripts/testflight.py --unsigned --build-number 3
# Signierte Archive, noch ohne Upload (zugeordnetes Team):
python3 native/ios/Scripts/testflight.py --team-id LCYUVY9ZZ4 --build-number 3
# Signieren und beide Apps zu App Store Connect hochladen:
python3 native/ios/Scripts/testflight.py --team-id LCYUVY9ZZ4 --build-number 3 --upload
```

Mit `--app customer` oder `--app pos` lässt sich nach einem Teilerfolg nur die noch fehlende App hochladen. Bei unklarem Upload-Ergebnis zuerst App Store Connect prüfen; keinen blinden Wiederholungsupload auslösen.

5. In App Store Connect Verarbeitung und eventuelle Warnungen prüfen. Export Compliance anhand des tatsächlichen Builds bestätigen; derzeit nur Betriebssystem-TLS, `ITSAppUsesNonExemptEncryption = false`.
6. Testinformationen hinterlegen und gewünschte Tester/Gruppe auswählen. Keine automatische Einladung an alle Teammitglieder. Externe Tests benötigen gegebenenfalls Apples Beta App Review. Ein erfolgreicher Upload allein bedeutet noch keine Testfreigabe.

## Vorgesehene Testhinweise

**Kunden-App:** Sortiment durchsuchen, Gebinde und Pfand prüfen, Warenkorb ab vier Kisten zusammenstellen, Kundenanmeldung und Lieferanfrage testen. Keine Onlinezahlung. Achtung: Diese Beta verbindet sich mit dem bestehenden Elias-System. Das Absenden erzeugt eine echte Lieferanfrage. Für eine reine Vorschau vor dem Absenden stoppen. Push-Mitteilungen sind noch nicht aktiv.

**Kassen-App:** Anmeldung und Mitarbeiterrechte, Suche/Barcodescanner, Inventur und Dokumentexport auf dem iPad Pro prüfen. Epson TM-m30II im lokalen Netzwerk einrichten und ausschließlich den vorgesehenen Testbon verwenden. Verkäufe und Inventurübernahmen verändern echte Betriebsdaten; nicht als unverbindliche Testbuchungen verwenden. TSE-/Kassenfreigabe und erfolgreicher Hardwaretest bleiben Voraussetzungen für den Livebetrieb. SumUp-Zahlung erfolgt separat am Terminal.

Quellen: [Apple: Builds hochladen](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds), [Apple: TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), [Epson: TM-m30II-Handbücher](https://support.epson.net/publist/bsmanual.php?lang=EN&model=TM-m30II).

## Uploadnachweis

Signierte Archive und Uploadprotokolle liegen lokal im Desktop-Projekt unter `output/ios/testflight-signed-20260921/`; sie sind nicht im Repository. Quellstand des ersten Builds: `1e3051f`.

- Kunden-Build: `c0c7e478-ec1e-4964-8aeb-04112d7a69a5`
- Kassen-Build: `9dcd035a-07da-48d4-93e9-bafa61336729`

Die Installation erfolgt über die Einladung in Apples TestFlight-App. USB-Verbindung und direkter Xcode-Start sind dafür nicht Bestandteil dieses Veröffentlichungswegs. Eine öffentliche App-Store-Veröffentlichung oder externe Testgruppe wurde nicht eingerichtet.
