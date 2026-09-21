# Projektstatus und Übergabe

Aktuelle Kassenüberarbeitung: [Arbeitsplatz, Variantenkatalog und iPad-Vollbild](KASSE-2026-09-21.md).

> Dieser Bericht dokumentiert den bereits veröffentlichten Ausgangsstand. Der neu vorbereitete Ausbau (149 SKUs, Kundenportal, Mitarbeiterrechte und Auslieferung) ist separat unter [Erweiterung vom 17.09.2026](ERWEITERUNG-2026-09-17.md) beschrieben und inzwischen veröffentlicht. Aktuelle Live-Prüfung: [Veröffentlichungsprotokoll](VEROEFFENTLICHUNG-2026-09-17.md).

## Implementiert und geprüft
- Eigenständige moderne Website im Original-Elias-Farbsystem, lokal gespeichertes Logo und illustrative Getränkefotografie.
- Übernommene Unternehmensdaten, Öffnungszeiten, Kontakt, datensparsam aktivierbare Google-Karte, konfigurierbarer Instagram-Link.
- 108 vollständig importierte Flyerpositionen inklusive Gebinden, Volumen, Originalpreisen und Veranstaltungsausstattung; keine erfundenen Pfandbeträge oder Bestände.
- Sortimentssuche, Kategorien, Sortierung, sitzungsgebundener Warenkorb und unverbindliche Lieferanfrage ab vier Kisten. Preise werden ausschließlich serverseitig aus dem Katalog verwendet; wiederholte Anfrage ist idempotent.
- Geschütztes CRM mit Inhaberrolle, eigener Finanznavigation, Artikel-/Bestandsverwaltung, Anlage, Einzel- und Mehrfachänderung, Lieferantenzuordnung und PDF-Artikellisten.
- Lieferantenverwaltung mit explizitem Demo-Lieferanten, Mindest- und Zielbeständen, automatischen Nachbestellentwürfen, Anrechnung offener Mengen und einmaliger Wareneingangsbuchung.
- Verschlüsselte SMTP-Konfiguration, Verbindungsprüfung, Versandwarteschlange/Protokoll, Kunden-Eingangsbestätigung, Inhaberbenachrichtigung und freigabepflichtiger automatischer Lieferantenversand. Kein Versand an Demo-Lieferanten; ohne Zugang deaktiviert.
- Browser-Testkasse: Gebindeauswahl, centgenaue Brutto-/Netto-/Steuerberechnung, separate Pfandausgabe/Rücknahme, simulierte Zahlarten, 80-mm-Testbon-PDF.
- Finanzansicht mit Tages-/Monatswahl, Testbelegjournal, unveränderbaren Testabschlüssen, PDF/CSV. Geschlossene Testperioden erlauben keine weiteren Testbelege.
- Supabase-Tabellen mit RLS, serverseitige Validierung/Autorisierung, AES-GCM für SMTP-Geheimnisse, Schutz gegen konkurrierende Artikeländerungen, CSRF-Prüfung, Test-/Echtbestands-Trennung.
- Installierbare Weboberfläche über Web-App-Manifest; responsive Oberfläche für iPad und Mobilgeräte.

## Nachweise
- 7 automatisierte Rechen-/Import-/Validierungstests bestanden.
- Datenbanktests in zurückgerollter Transaktion: RLS/RPC-Rechte, Nachbestelldeduplizierung, idempotenter Wareneingang, Summen/Steuer, unveränderbare Belege, Testbestandsisolation und Abschlusssperre.
- Browserprüfung: Desktop, 390-Pixel-Smartphone, 820-Pixel-iPad; alle CRM-Routen; kein JavaScript-Fehler; Artikeländerung, Warenkorbminimum und PDF-Download.
- API-Prüfung: anonyme Zugriffe blockiert, CSRF blockiert, manipulierte Clientpreise ignoriert, Mindestbestellung geprüft, Kundenanfrage gespeichert und Doppelsendung verhindert, veraltete Artikelversion blockiert, Demo-E-Mail-Freigabe abgelehnt, kein Geheimnis in API-Antwort.
- TypeScript, ESLint und Produktionsbuild erfolgreich.

## Offen vor echtem Geschäftsbetrieb
1. Pfand, Istbestände, steuerliche Artikelzuordnung, Laden-/Lieferpreise und eindeutige Sorten/EAN durch Inhaber prüfen. Aktuell ist kein importierter Artikel ungeprüft für die Kasse freigegeben.
2. Echten Lieferanten und SMTP-Konto einsetzen. Automatisierung ist initial ausgeschaltet.
3. Domainübernahme: bisherige getraenke-elias.de bleibt bis zur DNS-Umstellung beim bisherigen Hoster. Im CRM ist der Domainwunsch gespeichert; das ändert DNS nicht automatisch. Der neue Webauftritt läuft auf der Vercel-Domain.
4. Instagram-Profil fehlt; kein fremdes oder erfundenes Konto verlinkt.
5. TSE-Vertrag, Zugang und komplette Fiskalisierung mit DSFinV-K, Archivierung, Ausfall-/Stornoverfahren, Kassensturz sowie Einlagen/Entnahmen umsetzen und abnehmen. Die aktuelle Testkasse ist keine produktiv zugelassene Registrierkasse. Finanzexporte sind keine Steuerberaterabgabe/DATEV/DSFinV-K.
6. Bondruckermodell bestimmen, native/Netzwerk-SDK anbinden und am Gerät testen. PDF/Systemdruck ist implementiert; Direktdruck nicht.
7. Die ausdrücklich nach finaler Web-Fertigstellung vorgesehenen nativen Kunden- und iPad-Kassen-Apps sind noch nicht erstellt oder im App Store veröffentlicht. Die vorhandene Web-App ist keine native App.
8. USt-ID aus dem alten Impressum prüfen, Datenschutz-/Auftragsverarbeitungsverträge und Aufbewahrungs-/Löschkonzept finalisieren.

## Zugang
Inhaber-E-Mail: info@getraenke-elias.de. Das zufällige Erstpasswort liegt ausschließlich lokal in `.local/CRM-Zugang.txt`, außerhalb der Versionskontrolle. Es wurde keine Zugangs-E-Mail versendet. Nach Anmeldung unter `/passwort` ändern.

Weitere fachliche Details und Primärquellen: [TSE und Betrieb](TSE-UND-BETRIEB.md).

## Veröffentlichung
- Website: https://getraenke-elias.vercel.app
- CRM: https://getraenke-elias.vercel.app/login
- GitHub: https://github.com/NexHolding/getraenke-elias
- Supabase (Frankfurt): https://supabase.com/dashboard/project/sfggvhjtsiitqnocridz
- Vercel: https://vercel.com/nex-holding/getraenke-elias

Die beschriebenen Browser- und API-Prüfungen wurden zusätzlich erfolgreich gegen die öffentliche Vercel-Adresse ausgeführt. Der abschließende Datenbankbestand enthält 108 Artikel, einen Inhaberzugang und keine verbliebenen Testanfragen, Testverkäufe oder E-Mails. Eine lokale 6-seitige PDF-Prüfausgabe enthält alle 108 Artikel; ein 80-mm-Musterbon wurde ohne Datenbankbuchung gerendert und visuell kontrolliert.

Originaldomain und www sind bei Vercel hinterlegt, zeigen jedoch noch auf den bisherigen manitu-Webserver. Konkrete DNS-Einträge: [Domainumschaltung](DOMAIN-UMSTELLUNG.md).

## Global-Login
`global_admin` wird im Login als zusätzlicher Benutzername akzeptiert und auf ein eigenes Supabase-Auth-Konto abgebildet. Dieses Konto besitzt die serverseitig geprüfte Rolle `owner` mit vollständigen CRM-Verwaltungsrechten. Es gibt keinen Kennwortvergleich oder Authentifizierungs-Bypass im Quellcode. Das vom Auftraggeber vorgegebene Kennwort wird ausschließlich durch Supabase Auth verwaltet. Der bisherige Inhaberzugang bleibt erhalten.

## Ergänzung: Bezahlablauf und Epson-Ausgabe (17.09.2026)

Die frühere Angabe „Direktdruck nicht implementiert“ ist überholt: Netzwerk-Direktdruck über Epson ePOS-Print XML, Einrichtungsassistent, archivierte Bons, Wiederaufnahme offener Ausgabe, kontrollierter Kopiedruck und Digitalbon sind implementiert. Physischer Gerätetest und native USB-/Bluetooth-Anbindung bleiben offen. Einzelheiten und Prüfnachweise: [Epson und Bezahlen](EPSON-UND-BEZAHLEN.md). Live-TSE-Modus weiterhin gesperrt.

## Ergänzung: Finanzberichte und Kanzleizugang (17.09.2026)

Helle Tages-/Monatsberichte im Querformat mit Original-Logo, Steuer-/Zahlartenübersicht und Belegjournal; einheitlicher CSV-/PDF-Datenumfang. `steuerberater` ist als Mitarbeiter mit ausschließlich lesendem Finanz-/Exportzugriff eingerichtet. Details: [Finanzberichte](FINANZBERICHTE.md).


## Kundenkommunikation und Kontosicherheit (17.09.2026)

- Registrierung mit eigenem Passwort, erneuter Bestätigungsmail und Passwort-vergessen-Seite ergänzt.
- Bewusste Bestätigung schützt Einmallinks vor automatischen E-Mail-Vorschauen; Rücksetzung führt zur Passwortwahl.
- Kundenkonto und CRM-Kundenakte besitzen die zweite Navigation „Kommunikation“ mit Nachrichten, Versandstatus und Originalanhängen.
- Migration 019: privates, gegen Inhaltsänderungen geschütztes Archiv und verschlüsselte Auth-Versandwarteschlange. Fachbestände und Mitarbeiterrechte unverändert.
- Echte Supabase-Bestätigung und Passwortwechsel, Zugriffsgrenzen, Originaldateien sowie Versandarbeiter mit isoliertem SMTP-Adapter geprüft.
- Betriebsabhängigkeit: SMTP ist noch nicht eingerichtet. Tatsächliche Zustellung in externe Postfächer wurde nicht behauptet oder geprüft. Einrichtung unter Einstellungen → Schnittstellen erforderlich.
- Einzelheiten: `docs/KUNDENKOMMUNIKATION.md`.

## CRM-Bestellerfassung und Lieferautomatik (Migration 020)

- Manuelle, bestätigte Kundenbestellungen mit Kundensuche, Artikeln, Mengen, Lieferdatum, Hinweisen und transparenter Preis-/Pfandübersicht.
- Einmalig oder regelmäßig: wöchentlich, zweiwöchentlich, monatlich, vierteljährlich, halbjährlich, jährlich. Abos im CRM bearbeiten, pausieren und fortsetzen; Mitarbeiter benötigen das Bestellmodul.
- Atomare Anlage mit Schutz vor Doppelbestellungen; revisionsgesicherte Aboänderung, Kalenderanker, sichtbare Automatikfehler und Schutz gegen vorzeitige Tourenplanung.
- Umsetzung und Bedienung: [Manuelle Bestellungen](MANUELLE-BESTELLUNGEN.md). Echtes SMTP bleibt separat einzurichten.

## Manuelle Lieferantenbestellungen (Migration 021)

Unter Einkauf können Inhaber und Mitarbeiter mit Einkaufsrecht Zusatzbestellungen mit Lieferant, Artikeln, Mengen, Wunschtermin und Kundenauftragsbezug erfassen. Offene manuelle Mengen sind ausdrücklich von der automatischen Bedarfsminderung ausgeschlossen. Entwürfe werden nur nach expliziter Auswahl per E-Mail verschickt oder als extern bestellt dokumentiert. Versandstatus und Wareneingang sind in der Einkaufsübersicht enthalten. Siehe [Manuelle Lieferantenbestellungen](MANUELLE-LIEFERANTENBESTELLUNGEN.md).

## iOS-App-Basis (17.09.2026)

Zwei eigenständige SwiftUI-Xcode-Targets sind unter `native/ios` angelegt: Kunden-App für iPhone/iPad und Kassen-App für iPad. Nativer Katalog mit echten Produktdaten, persistenter Warenkorb und geschützter Bestellübergabe; bestehendes Kundenportal/Kassen-CRM in WKWebView, native Kamera-Barcodesuche, Epson-HTTPS-Transport und lokaler Einrichtungsdialog. Beide Simulatorabläufe und unsignierte Geräte-Builds geprüft; kein TestFlight-/App-Store-Upload und kein echter Drucker-/TSE-Test. Die frühere Aussage, es gebe noch keine native Codebasis, ist damit überholt. [Architektur, Umfang und Startanleitung](../native/ios/README.md), [Fragen für die nächste Runde](../native/ios/FRAGEN-FUER-MORGEN.md).
