# Elias iOS · erste App-Basis

Zwei getrennte SwiftUI-Anwendungen, gemeinsamer Swift-/WebKit-Unterbau, vorhandenes Elias-Backend. Entwicklungsstand 0.1.0 vom 17.09.2026. Kein App-Store-/TestFlight-Release.

## In Xcode öffnen

`native/ios/EliasApps.xcodeproj` öffnen. Geteilte Schemes:

| Scheme | Geräte | Vorläufige Bundle-ID |
|---|---|---|
| EliasCustomer | iPhone und iPad, ab iOS 17 | de.getraenkeelias.kunden |
| EliasPOS | iPad, ab iPadOS 17 | de.getraenkeelias.kasse |

Xcode 26.3 wurde für die Abnahme verwendet. Für den Simulator ist kein Apple-Team nötig. Für Installation auf echten Geräten und TestFlight muss der Apple-Account in Xcode angemeldet sein. Team und Bundle-IDs sind für Chris Neve (`LCYUVY9ZZ4`) zugeordnet. Keine Kennwörter, Zertifikate oder Supabase-Geheimnisse sind eingebaut.

Die eingecheckte Xcode-Datei ist unmittelbar verwendbar. `python3 native/ios/Scripts/generate-project.py` erzeugt sie bei Strukturänderungen reproduzierbar neu; Änderungen an Signierung/Bundle-IDs dann auch im Generator berücksichtigen. Das zugeordnete Apple-Team ist Chris Neve (`LCYUVY9ZZ4`).

## Kunden-App

- Native Sortimentsübersicht aus `/api/catalog`: Suche, Kategorien, Produktbilder, Gebinde, Preise einschließlich MwSt. und getrenntes Pfand.
- Nativer Warenkorb, 1–100 Gebinde je Position, höchstens 200 Positionen; vier Kisten Mindestmenge. Nicht verfügbare Artikel und ungeklärter Pfand blockieren den Abschluss.
- Warenkorb und öffentliche Katalogkopie im geschützten App-Verzeichnis. Ein gespeicherter Katalog ist als solcher gekennzeichnet; der Abschluss lädt aktuelle Serverpreise.
- Geschützter Web-Abschluss innerhalb der App: vier getrennte Adressfelder, Gast/Kundenkonto gemäß CRM-Einstellung, ausdrückliches Absenden einer Lieferanfrage, Auftragsbestätigung.
- Vor dem Senden wird die Vorgangskennung lokal gespeichert. Unklare Ergebnisse sperren Warenkorbänderungen; Fortsetzen verwendet dieselbe Kennung. Nur eine bestätigte Serverantwort leert den nativen Warenkorb. Es gibt keine automatische Bestellung im Hintergrund.
- Kundenkonto einschließlich Registrierung, E-Mail-Bestätigung, Passwort-Rücksetzung, Bestellhistorie, Lieferabos und Kommunikation über das bestehende Kundenportal im geschützten WebKit-Bereich.
- Kontakt, Telefon, E-Mail, Kartenroute, Öffnungszeiten, Datenschutz und Impressum.

E-Mail-Links öffnen zurzeit die bestehende Website. Nach E-Mail-Bestätigung kann die Anmeldung in der App erfolgen. Universal Links/APNs sind noch nicht eingerichtet.

## iPad-Kasse

- Eigenständige iPad-App mit nativem Rahmen und bestehendem CRM-Kassenarbeitsplatz in WKWebView. Der Verkaufsbereich ist in dieser Grundversion noch keine vollständig in SwiftUI neu geschriebene Kasse.
- Vorhandener Inhaber-/Mitarbeiterlogin, Gerätefreigabe, PIN-Wechsel und serverseitige Modulrechte; keine neuen Rollen oder Berechtigungsumgehung.
- Pfand, Rabatte, Inventur, Einkauf, Kundenbestellungen, Finanzen und Belegarchiv verwenden weiterhin dieselben CRM-Abläufe.
- Nativer Kamera-Barcodescanner über VisionKit. Der Scan füllt die Kassensuche; der Mitarbeiter bestätigt den Artikel durch Antippen. Unterstütztes Gerät und Kameraerlaubnis erforderlich. Eingabe über die bestehende Suchzeile bleibt möglich.
- Sichtschutz im App-Umschalter. Dieser ersetzt keine erneute PIN-Prüfung; automatische PIN-Sperrzeiten sind noch festzulegen.
- PDFs/CSV aus dem Web-Arbeitsplatz werden über WKDownload in einen temporären Exportordner übernommen und im iOS-Teilen-Dialog geöffnet.

## Epson-Grundlage

1. Drucker mit aktiviertem ePOS-Print/HTTPS im selben Netzwerk bereitstellen.
2. In der App über das Druckersymbol die lokale HTTPS-Adresse freigeben.
3. Dieselbe Adresse unter CRM → Einstellungen → Bon-Drucker hinterlegen, Gerätekennung/Papierbreite setzen, vorhandenen Verbindungstest und Testbon ausführen.

Der Webclient erkennt die Kassen-App und übergibt sein ePOS-XML über eine streng begrenzte WebKit-Brücke. Die native URLSession sendet es an genau die lokal freigegebene Adresse und gibt die Epson-Antwort an die vorhandene Statusprüfung zurück. Dadurch entfällt für diesen Transport die Browser-CORS-Grenze. Keine TLS-Ausnahme, keine Weiterleitungen und kein automatischer Wiederholungsdruck. Unsichere Antworten bleiben „unklar“ im bestehenden Belegablauf.

**Hardwareabnahme ausstehend:** Modell festgelegt: Epson TM-m30II am iPad Pro. Firmware, Anschlussvariante, Netzwerk, Zertifikat und Papierformat sind noch zu prüfen. Bluetooth/USB und das Epson-SDK sind nicht eingebunden. Ein Kauf/SDK-Paket wird erst nach Modellfestlegung benötigt. Der bisherige TSE-Einrichtungsstatus wird nicht geändert; die App macht eine unfiskalisierte Kasse nicht produktionsbereit.

## Architektur und Sicherheitsgrenzen

- `Sources/Core`: Decodable-Modelle, ganze Centbeträge, Pfand-/Mindestmengen, Navigation und erlaubte Druckerziele; eigenständig als Swift Package testbar.
- `Sources/Customer`: nativer Katalog, Cache, persistenter Warenkorb und Tabs.
- `Sources/POS`: iPad-Arbeitsplatz, Kamerascanner, native Druckerfreigabe.
- `Sources/Shared`: Branding, Verbindungshinweise, WKWebView, Download/Teilen, ePOS-Transport.
- `lib/native-app.ts`: versioniertes Nachrichtenformat. `/app/bestellen` importiert ausschließlich Kennungen und Mengen; Preise bleiben serverseitig.
- Brücke nur im Hauptframe, auf dem exakten HTTPS-Ursprung und den passenden Routen; Kundenteil kann keine Druckaufträge auslösen. Drucktransport nur an konfigurierte private IPv4- oder `.local`-Adresse und den ePOS-Endpunkt.
- Web-Anmeldungen verbleiben im WKWebsiteDataStore des jeweiligen App-Sandboxes; keine Passwörter/Token werden in Swift übernommen. Website-/CRM-Berechtigungen gelten unverändert.
- Standardhost ist bewusst `getraenke-elias.vercel.app`, da die eigene Domain noch auf den alten Hoster zeigt. Wechsel erst nach DNS-Umstellung; danach AppConfig/Origin-Regeln gemeinsam anpassen.
- Keine Offline-Kassenbuchungen und keine Hintergrundbestellwarteschlange. Offline sind nur bereits geladener öffentlicher Katalog und Warenkorb verfügbar.

## Prüfungen

```sh
swift test --package-path native/ios
xcodebuild -project native/ios/EliasApps.xcodeproj -scheme EliasCustomer -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project native/ios/EliasApps.xcodeproj -scheme EliasPOS -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
# Für UI-Tests eine vorhandene Simulator-ID einsetzen:
xcodebuild -project native/ios/EliasApps.xcodeproj -scheme EliasCustomer -destination 'platform=iOS Simulator,id=SIMULATOR-ID' CODE_SIGNING_ALLOWED=NO test
npm run build
npm run start -- --hostname 127.0.0.1 --port 3017
# In einem zweiten Terminal:
node scripts/verify-native-bridge.mjs
```

Die Foundation-UI-Tests verwenden `--uitesting`, lokale Beispieldaten und einen statischen Web-Arbeitsplatz. Die zusätzlichen Live-Tests laden den öffentlichen Katalog und öffnen einen ausschließlich lokal zusammengestellten Warenkorb im Web-Abschluss, ohne Login, Eingabe von Kundendaten oder Bestellabsendung. Der Browser-Brückentest simuliert alle APIs und den Druckerkanal. Keine echten Bestellungen, Finanzbuchungen, E-Mails oder Druckaufträge werden erzeugt.

Vor einem Store-Release zusätzlich: Apple-Team/Vertriebsweg, Kontolöschung in der Kunden-App, vollständige Datenschutzerklärung und Store-Datenschutzangaben, reale E-Mail-Zustellung, echte Geräte-/Druckerabnahme, fiskalischer Livebetrieb und gewünschte Zahlungsabwicklung. Das Privacy-Manifest bildet den derzeitigen funktionalen Datenumfang ab und muss mit dem endgültigen Datenfluss abgeglichen werden.

## Technische Primärquellen

- [Apple: WKScriptMessage](https://developer.apple.com/documentation/webkit/wkscriptmessage)
- [Apple: Kameraberechtigung](https://developer.apple.com/documentation/avfoundation/avcapturedevice/requestaccess(for:completionhandler:))
- [Apple: Kamera-Scanner](https://developer.apple.com/documentation/visionkit/scanning-data-with-the-camera)
- [Apple: Accountlöschung in Apps](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple: Required-reason APIs / Privacy Manifest](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Epson: native SDK-/MFi-Anbindung](https://global.epson.com/products_and_drivers/tm/en/mfi.html)
- [Epson: SDK-Download und unterstützte Änderungen](https://www.epson.jp/dl_soft/readme/47014.htm)

Offene Entscheidungen stehen in [FRAGEN-FUER-MORGEN.md](FRAGEN-FUER-MORGEN.md).

## TestFlight und Entscheidungen vom 21.09.2026

Beide Apps sollen über TestFlight getestet werden. Kundenbestellungen bleiben Lieferanfragen; Onlinezahlung folgt später. Die Kasse läuft auf dem iPad Pro, der Bondrucker ist ein Epson TM-m30II. SumUp bleibt ein separates EC-Gerät ohne Integration. Veröffentlichungsschritte und Testhinweise: [TESTFLIGHT.md](TESTFLIGHT.md). Kundenbenachrichtigungen: [PUSH-KONZEPT.md](PUSH-KONZEPT.md).
