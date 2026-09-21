# Apple-Prüfung · Getränke Elias · 21. September 2026

Geprüft: Kunden-App `de.getraenkeelias.kunden`, iPad-Kasse `de.getraenkeelias.kasse`, gemeinsames Web-Backend und App-Store-Connect-Angaben. Dies ist eine technische Prüfung des vorliegenden Stands, keine Zusage einer Apple-Freigabe oder rechtliche Zertifizierung.

## Kontolöschung umgesetzt

Kunden erreichen die Funktion unter **Mein Konto → Konto löschen**, zusätzlich im nativen Menü **Kontoeinstellungen → Konto löschen**. Die Löschseite bleibt auch bei einer noch nicht zugeordneten Kundenakte zugänglich. Angezeigt wird das angemeldete Konto. Aktuelles Passwort und ausdrückliche Bestätigung sind erforderlich; keine Kontaktaufnahme, kein E-Mail-Versand und keine kostenpflichtige Aktion.

Der Server bestimmt die Identität aus der authentifizierten Sitzung und prüft das Passwort erneut. Mitarbeiterkonten sind ausgeschlossen. CSRF-/Origin-Prüfung und Versuchslimit sind aktiv. Die Datenbankfunktion ist ausschließlich für den Server freigegeben. Eine konkurrierende Kontoprovisionierung darf ein zur Löschung vorgemerktes Konto nicht wiederherstellen.

- Persönliche Stammdaten, Adressen, Koordinaten, Lieferpräferenzen, Profilnotizen und nicht erforderliche Profilkopien im Änderungsprotokoll werden entfernt.
- Lieferabos werden beendet. Nicht mehr referenzierte Abos und noch unbestätigte beziehungsweise stornierte Anfragen ohne Belege werden entfernt; zugehörige E-Mail-Kopien werden gelöscht.
- Kontomails einschließlich verschlüsselter Versandaufträge werden entfernt. Das Supabase-Auth-Konto wird tatsächlich hart gelöscht, nicht nur gesperrt. Der Service-Schlüssel bleibt serverseitig.
- Bestätigte Aufträge, offene Forderungen, Lieferscheine, Rechnungen und deren geschäftlich erforderliche Kommunikation bleiben zweckgebunden erhalten. Historische Belege, Warenbestand und Finanzsummen werden durch die Kontolöschung nicht geändert. Eine neue Registrierung mit derselben E-Mail erhält keinen Zugriff auf die alten Unterlagen.
- Die Ausnahme im unveränderlichen Änderungsprotokoll erlaubt ausschließlich die Redaktion persönlicher Profil-/Anfragekopien während der privaten Löschtransaktion; Finanzjournale bleiben unverändert. Der Löschvorgang erhält einen technischen Nachweis ohne alte Profildaten.
- Bei einem Auth-Ausfall wird der angenommene Auftrag persistent gespeichert und durch den bestehenden Fünf-Minuten-Worker wiederholt. Die Löschseite bestätigt den tatsächlichen Abschluss; sie meldet einen offenen Vorgang nicht als abgeschlossen. Der zufällige Statuscode enthält keine Kontodaten, abgeschlossene Jobdaten werden nach 30 Tagen entfernt.
- Die aktuelle Kunden-App entfernt nach Abschluss WKWebView-Daten, den lokalen Warenkorb, letzte Anfrage und temporäre Downloads. Vom Kunden separat exportierte Dateien und Daten auf anderen Geräten werden nicht behauptet fernzulöschen. Alte TestFlight-Versionen benötigen für die zusätzliche native Bereinigung Build 3.

Grundlage: [Apple: Kontolöschung in Apps](https://developer.apple.com/support/offering-account-deletion-in-your-app/). Gesetzlich notwendige Aufbewahrung ist von der Kontolöschung zu unterscheiden; konkrete Fristen richten sich nach der Dokumentart, unter anderem [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html). Auth-Implementierung: [Supabase deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser), [Sitzungen und JWTs nach Löschung](https://supabase.com/docs/guides/auth/managing-user-data). Kunden-APIs prüfen den Benutzer serverseitig mit getUser; ein noch nicht abgelaufenes JWT darf keine neue Kundenakte erzeugen. Es existiert kein direkter öffentlicher Zugriff auf die Geschäftstabellen.

## Prüfung beider Apps

| Bereich | Befund / Umsetzung |
|---|---|
| Native Funktionalität | Kunden-App mit nativem Sortiment und lokalem Warenkorb; Kasse mit Barcodekamera, Druckerschnittstelle und Vollbild. Die endgültige Bewertung des Nutzwerts nimmt Apple vor. |
| Anmeldung | Sortiment und Marktkontakt ohne Kundenkonto erreichbar. Eigener E-Mail-/Passwortzugang; kein Social Login. Daher aktuell keine zusätzliche Apple-Anmeldung erforderlich. |
| Käufe | Physische Getränke und Lieferungen, keine digitalen Käufe. Lieferabos sind keine Apple-In-App-Abonnements; kein StoreKit erforderlich. |
| Datenschutz erreichbar | Kunden-App über „Dein Markt“ und Kontomenü; Kassen-App zusätzlich über „Informationen“ vor der Anmeldung beziehungsweise außerhalb der Vollbildkasse. Datenschutzseite auf beide Apps erweitert. |
| Berechtigungen | Kamera nur Barcodeerkennung in der Kasse, lokales Netzwerk nur freigegebener Epson. Zwecktexte vorhanden. Keine Kontakte-, Mikrofon-, Fotomediathek- oder GPS-Abfrage; manuelle Artikelauswahl bleibt möglich. |
| Datensicherheit | HTTPS, Ursprung-/Hauptframe-Prüfung der Web-Bridge, keine pauschale ATS-Ausnahme, kein Umgehen von Druckerzertifikaten, Datenschutzabdeckung im App-Umschalter. Keine Schlüssel im App-Bundle. |
| Tracking | Keine Werbe-/Tracking-SDKs oder IDFA. Kein ATT-Dialog erforderlich, solange dieser Datenfluss unverändert bleibt. |
| Privacy Manifest | Beide Targets enthalten ein Manifest. UserDefaults-Zweck CA92.1. Datentypen um Nachrichten, technische Diagnose und optional geokodierte Lieferadresse ergänzt. Kasse besitzt zusätzlich ein eigenes Manifest für Terminalkennung und Finanzdaten. Kameraaufnahmen werden nicht gespeichert/hochgeladen. |
| SDK | Lokal Xcode 26.3 / iOS SDK 26.2; erfüllt die seit 28. April 2026 verlangte SDK-Generation. Mindestbetriebssystem bleibt iOS/iPadOS 17. |
| Alkohol | Online-Bestellanfrage enthält Volljährigkeitsbestätigung und Hinweis auf Alterskontrolle bei Übergabe. Keine Bewerbung übermäßigen Konsums. Die tatsächliche Altersprüfung bei Übergabe und die Apple-Altersfreigabe sind zusätzlich erforderlich. |
| Benachrichtigungen | Push ist derzeit nicht implementiert; daher keine Push-Werbeversprechen in Store-Texten. Später gesonderte Zustimmung und abschaltbare Marketingnachrichten vorsehen. |

Grundlagen: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (insbesondere 1.4.3, 1.5, 2.1, 3.1.3(e), 4.2, 4.8, 5.1), [Apple SDK-Vorgaben](https://developer.apple.com/news/upcoming-requirements/), [App-Datenschutz einschließlich WebViews](https://developer.apple.com/app-store/app-privacy-details/), [Manifest-Datentypen](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype).

## Vor öffentlicher App-Store-Freigabe noch offen

Die Prüfung in App Store Connect zeigte bei beiden Apps einen Entwurf „1.0 – In Vorbereitung zur Übermittlung“: Screenshots, Beschreibung, Support-URL und Review-Zugang waren zunächst leer, Datenschutzlabels noch nicht begonnen, Kategorie und Altersfreigabe bei der Kunden-App nicht eingerichtet. Die Datenschutz-URL wurde für beide Apps hinterlegt, der direkte Löschlink zusätzlich für die Kunden-App. Der Supportlink der Kassen-App wurde ergänzt; der Supportlink der Kunden-App muss im Store-Entwurf noch gespeichert werden. Der Entwickler ist dort als Händler ausgewiesen. Das Vorhandensein der Inhaltsrechte-Erklärung war nicht bestätigt.

Für beide Apps ist vor einer öffentlichen Einreichung noch erforderlich:

1. Store-Metadaten vervollständigen: aktuelle Screenshots für unterstützte Geräte, zutreffende Beschreibung, Kategorie, Support-URL, Release-Version passend zum ausgewählten Build, Altersfragebogen einschließlich Alkoholbezug. Nicht als Kinder-App einreichen.
2. Die tatsächlich verwendeten Datentypen aus den beiden Manifesten in App Store Connect übernehmen und veröffentlichen. Kein Tracking; Zwecke App-Funktionalität, kontoverknüpfte Kontakt-/Bestell-/Nachrichtendaten. Serverdiagnose und optionale Adressgeokodierung berücksichtigen. Ein Manifest ersetzt die Store-Datenschutzlabels nicht.
3. Einen eigenständigen, eingeschränkt berechtigten Review-Zugang und sichere Testdaten bereitstellen. Kein Global-Admin-Passwort an Apple übermitteln. Für die Prüfung der Kontolöschung einen entbehrlichen Kunden-Testzugang anbieten; für die Kasse einen beschriebenen Testablauf ohne echte Kassenbuchungen.
4. Produktbild-/Markenrechte und korrekte Betreiber-/Steuerangaben durch den Betreiber bestätigen. Die frühere unplausible USt-ID darf nicht als geprüft gelten. Datenschutz-/Auftragsverarbeitungsvereinbarungen und betriebliche Aufbewahrung/Löschfristen final abgleichen.
5. Endabnahme auf iPhone und iPad Pro: Netzverlust, Login/Passwortwiederherstellung, Barcodes, Druckerberechtigung, tatsächlicher Epson-Ausdruck sowie TSE-/Kassenbetrieb. Druckeradresse/Netzwerk und Fiskaly-Vertrag/Test-/Produktivdaten sind betrieblich noch abzustimmen. Ein TestFlight-Upload ist keine fiskalische Zulassung.
6. Für die interne Kassen-App den dauerhaften Vertriebsweg bestimmen (z.B. Custom App über Apple Business Manager oder geeignete nicht gelistete Verteilung). TestFlight ist zeitlich begrenzt; keine öffentlich nutzbare Kasse ohne betriebliche Einrichtung versprechen.

## Verifikation

70 TypeScript-Tests, vollständige Datenbanktests einschließlich Kontolöschung, echte Route/Retry-Worker gegen isolierte Auth-/DB-Adapter, Browserprüfung mit simulierten Antworten auf 390 und 1024 Pixel Breite, ESLint, Produktionsbuild und vier Swift-Core-Tests. Zusätzlich beide iOS-Targets archiviert und als 0.1.0 (3) zu Apple hochgeladen. Keine echte Kundenlöschung, Bestellung, Rechnung oder E-Mail wurde für diese Tests ausgelöst.

## Veröffentlichung dieses Stands

Migration `202609170035` angewendet; Vorher-/Nachher-Prüfsummen bestehender Kunden, Aufträge, Belege, Lagerdaten, Kommunikation und Einstellungen identisch. Code-Commit `552576f` auf GitHub main. Vercel-Produktion `https://getraenke-elias-5mhu3q574-nex-holding.vercel.app` ist READY; live geprüfte Löschseite und API-Zugriffsschutz. Beide TestFlight-Builds 3 der bestehenden internen Gruppe zugewiesen; Kasse „Im Test“, Kunden-App beim vorhandenen Tester bereits als Build 3 installiert gemeldet. Keine öffentliche App-Store-Einreichung ausgelöst.
