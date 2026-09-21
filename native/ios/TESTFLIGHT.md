# TestFlight · beide Elias-Apps

Stand 21.09.2026: Beide App-Datensätze und Bundle-IDs sind im Apple-Team **Chris Neve (`LCYUVY9ZZ4`)** angelegt. TestFlight-Beschreibungen, Feedbackadresse und Datenschutz-URL sind hinterlegt. Xcode 26.3 und ein Entwicklungszertifikat sind vorhanden; beide unsignierten Gerätearchive bauen erfolgreich. **Noch kein Build hochgeladen:** Der Signierversuch wird durch die abgelaufene Apple-Anmeldung in Xcode blockiert. Die erneute Browser-Anmeldung allein erneuert Xcodes Sitzung nicht.

| App | Apple-ID | App Store Connect |
|---|---|---|
| Getränke Elias | 6814398025 | [Kunden-App](https://appstoreconnect.apple.com/apps/6814398025/distribution) |
| Elias Kasse | 6814398531 | [Kassen-App](https://appstoreconnect.apple.com/apps/6814398531/distribution) |

Geprüfter Benutzerkreis bei Anlage: ausschließlich der bestehende Accountinhaber/Administrator Chris Neve; keine weiteren Apple-Benutzer angelegt oder eingeladen.

Verbunden erkannt: iPhone 17 Pro Max und iPad Pro 12,9 Zoll (4. Generation). Auf dem iPad ist der Entwicklermodus für direkte Xcode-Tests noch deaktiviert. Es wurde noch keine Elias-App auf diesen Geräten installiert.

## Festgelegter Umfang

- **Getränke Elias** (`de.getraenkeelias.kunden`): iPhone/iPad ab iOS 17, Lieferanfragen. Onlinezahlung folgt später.
- **Elias Kasse** (`de.getraenkeelias.kasse`): iPad Pro mit iPadOS 17 oder neuer. Bar/Karte im CRM erfassen; das separate SumUp-EC-Gerät wird nicht angesteuert. Eine Kartenbuchung in Elias bestätigt keine Zahlung am SumUp-Gerät; diese muss der Mitarbeiter zuvor am Terminal prüfen.
- Bondrucker **Epson TM-m30II**, vorbereiteter ePOS-HTTPS-Netzwerktransport. Anschlussvariante, Zertifikat und echter Testdruck noch abnehmen. Keine Bluetooth-/USB-Anbindung in diesem Build.
- Push-Konzept in [PUSH-KONZEPT.md](PUSH-KONZEPT.md); noch keine aktive APNs-Funktion.

## Veröffentlichung

1. **Offen:** In Xcode → Settings → Accounts den vorhandenen Apple-Account erneut anmelden. Team `LCYUVY9ZZ4` ist im Projekt zugeordnet; beide Bundle-IDs sind registriert.
2. **Erledigt:** Zwei iOS-App-Datensätze mit obigen Bundle-IDs, Deutsch als Hauptsprache und SKUs `elias-kunden-ios`, `elias-kasse-ios` sind angelegt.
3. Nächste unbenutzte Buildnummer in App Store Connect prüfen. Der erste vorgesehene Build ist `0.1.0 (1)`; bei bereits erfolgtem Upload erhöhen.
4. Signieren und hochladen. Das Script verwendet das Xcode-Konto und dessen automatische Signierung; es enthält keine Zugangsdaten und speichert Ausgaben unter dem ignorierten `output/ios/`.

```sh
# Vorprüfung ohne Team, ohne Upload:
python3 native/ios/Scripts/testflight.py --unsigned --build-number 1
# Signierte Archive, noch ohne Upload (zugeordnetes Team):
python3 native/ios/Scripts/testflight.py --team-id LCYUVY9ZZ4 --build-number 1
# Signieren und beide Apps zu App Store Connect hochladen:
python3 native/ios/Scripts/testflight.py --team-id LCYUVY9ZZ4 --build-number 1 --upload
```

Mit `--app customer` oder `--app pos` lässt sich nach einem Teilerfolg nur die noch fehlende App hochladen. Bei unklarem Upload-Ergebnis zuerst App Store Connect prüfen; keinen blinden Wiederholungsupload auslösen.

5. In App Store Connect Verarbeitung und eventuelle Warnungen prüfen. Export Compliance anhand des tatsächlichen Builds bestätigen; derzeit nur Betriebssystem-TLS, `ITSAppUsesNonExemptEncryption = false`.
6. Testinformationen hinterlegen und gewünschte Tester/Gruppe auswählen. Keine automatische Einladung an alle Teammitglieder. Externe Tests benötigen gegebenenfalls Apples Beta App Review. Ein erfolgreicher Upload allein bedeutet noch keine Testfreigabe.

## Vorgesehene Testhinweise

**Kunden-App:** Sortiment durchsuchen, Gebinde und Pfand prüfen, Warenkorb ab vier Kisten zusammenstellen, Kundenanmeldung und Lieferanfrage testen. Keine Onlinezahlung. Achtung: Diese Beta verbindet sich mit dem bestehenden Elias-System. Das Absenden erzeugt eine echte Lieferanfrage. Für eine reine Vorschau vor dem Absenden stoppen. Push-Mitteilungen sind noch nicht aktiv.

**Kassen-App:** Anmeldung und Mitarbeiterrechte, Suche/Barcodescanner, Inventur und Dokumentexport auf dem iPad Pro prüfen. Epson TM-m30II im lokalen Netzwerk einrichten und ausschließlich den vorgesehenen Testbon verwenden. Verkäufe und Inventurübernahmen verändern echte Betriebsdaten; nicht als unverbindliche Testbuchungen verwenden. TSE-/Kassenfreigabe und erfolgreicher Hardwaretest bleiben Voraussetzungen für den Livebetrieb. SumUp-Zahlung erfolgt separat am Terminal.

Quellen: [Apple: Builds hochladen](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds), [Apple: TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), [Epson: TM-m30II-Handbücher](https://support.epson.net/publist/bsmanual.php?lang=EN&model=TM-m30II).
