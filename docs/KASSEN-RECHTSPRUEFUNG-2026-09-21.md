# Getränke Elias – Kassenprüfung und nächste Schritte

Stand: 21. September 2026. Technische Bestandsaufnahme und Umsetzungshinweise, keine Bescheinigung einer rechtssicheren Inbetriebnahme. **Der steuerliche Echtbetrieb bleibt gesperrt.**

## Umgesetzte Änderungen

- Geschäftsanschrift in vier Feldern: Straße, Hausnummer, PLZ und Ort; vorhandene Anschrift wird übernommen. Der Rabattvorschlag entfällt aus den Einstellungen.
- Umsatzsteuer pro Artikel und Pfand sowie Vorgaben für neue Artikel sind änderbar. Bestehende Bons behalten ihre damaligen Preise und Steuersätze. Änderungen werden nicht automatisch aus Gesetzesänderungen abgeleitet; die steuerliche Einordnung muss artikelbezogen bestätigt werden. Die Produktdatenbank unterstützt ganze Prozentwerte von 0 bis 100. Getränke sind nicht pauschal mit 7 % zu versteuern.
- Bestellautomatik: Schalter, Wochentage, Wochenrhythmus und Uhrzeit bleiben nach Speichern/Neuladen erhalten. Der erfolgreiche Speichervorgang setzt den Einstellungsbereich nicht mehr zurück. Die aktuelle Produktionseinstellung wurde bei der Prüfung nicht eingeschaltet; es wurden keine Lieferantenbestellungen ausgelöst.
- PDF-Bons erscheinen als geschützte Vorschau direkt im Browser bzw. im Webbereich der iPad-App. Das Dokument wird lokal gerendert; keine externe PDF-Software nötig.
- Kasse und Finanzen enthalten Belegsuche, vollständige oder teilweise Korrekturen und Rückgaben. Die Rolle „Belege stornieren und Rückgaben buchen“ wird Mitarbeitern ausdrücklich erteilt; Inhaber sind berechtigt, der reine Steuerberaterzugang nicht.
- Originalbons bleiben unverändert. Gegenbelege erhalten eigene Nummer, Originalbezug, Grund, Erläuterung, Bedienung, Erstattungsart und Buchungsdatum. Bereits erstattete Mengen sind gesperrt. Wiederholung nach unklarer Serverantwort verwendet dieselbe Vorgangs-ID. PDF-Archivierung ist unabhängig von der bereits gebuchten Korrektur wiederholbar.
- Erstattungen verwenden ursprüngliche Preise, Rabatte und Steuersätze. Mehrere Teilrückgaben gleichen auch Rundungscent des Originals exakt aus. Verkaufbare Ware kann zurückgebucht werden; Bruch/mangelhafte Ware wird nicht wieder als verfügbar eingelagert. Der Gegenbeleg dokumentiert die Auswahl.
- Rückgabe am 10. Oktober zu einem Kauf am 28. September wirkt auf den 10. Oktober und den Oktoberbericht. Barerstattungen senken den rechnerischen Barbestand; Kartenerstattungen werden am separaten Terminal durchgeführt und bestätigt. Bereits gespeicherte Abschlusssnapshots werden nicht heimlich überschrieben; aktuelle Auswertungen berücksichtigen die neuen Gegenbelege. Für den regulären Betrieb ist die endgültige Abschluss-/Nachtragslogik noch abzunehmen.

## Freiwillige Rücknahme im Laden

Bestätigte Regel: 14 Kalendertage nach Kauf für ausdrücklich freigegebene Nicht-Lebensmittel, unbenutzt und vollständig, mit Originalbon. Die Freigabe erfolgt pro Artikel und wird beim Verkauf im Bon eingefroren. Ältere Bons ohne diese Zusage erhalten sie nicht nachträglich. Nach Fristablauf ist die freiwillige Rückgabe gesperrt. Buchungskorrekturen und gesetzliche Mängelrechte sind separat zu beurteilen und bleiben möglich.

Ein pauschales gesetzliches 14-Tage-Rückgaberecht beim Einkauf im Laden besteht nicht. Beim Fernabsatz gelten andere Regeln; Getränke sind nicht allein deshalb generell vom Widerruf ausgeschlossen. Die Website nimmt derzeit unverbindliche Lieferanfragen entgegen. Falls später online verbindliche Verträge geschlossen werden, sind Bestellablauf, Widerrufsinformationen, Ausnahmen, Preisangaben und Bestellbestätigung erneut zu prüfen. [BGB, insbesondere §§ 312g, 355, 356 und 437](https://www.gesetze-im-internet.de/bgb/BJNR001950896.html). Umsatzsteuerliche Berichtigungen sind im maßgeblichen Berichtigungszeitraum zu berücksichtigen; die konkrete Behandlung hängt auch von Versteuerungsart und Fall ab. [§ 17 UStG](https://www.gesetze-im-internet.de/ustg_1980/__17.html).

## Fiskaly: Account und Einrichtung

Der Nutzer hat klargestellt, dass bisher noch keine TSE angebunden wurde. Die Auswahl „Fiskaly“ im CRM ist keine aktive Anbindung. Zum Prüfzeitpunkt sind keine Fiskaly-Umgebungsvariablen hinterlegt.

Fiskaly unterstützt einen Account für Händler oder Softwareanbieter. Für Elias allein empfehlen wir einen vom Inhaber kontrollierten Account und berechtigte technische Betreuung durch euch. Alternativ kann eure Firma mehrere Händler unter einem Anbieteraccount mit getrennten verwalteten Organisationen betreuen; Vertrags-, Support-, Datenschutz- und Abrechnungszuständigkeit müssen dann festgelegt sein. Je Standort wird eine verwaltete Organisation und mindestens eine TSS, je Kasse ein Client zugeordnet. [Fiskaly Integrationsanleitung](https://workspace.fiskaly.com/de/countries/germany/integration-guide/), [Zuordnung von Organisation, TSS und Kassen](https://support.fiskaly.com/hc/de/articles/8106834808604-SIGN-DE-Wie-viele-verwaltete-Organisationen-und-TSEs-soll-ich-anlegen).

Account und TEST-Organisation sind kostenlos; LIVE-Instanzen kostenpflichtig. Die LIVE-Freischaltung erfolgt laut Fiskaly über den Vertrieb. Es wurde hier weder ein Vertrag geschlossen noch eine kostenpflichtige TSE aktiviert. [Fiskaly HUB-Handbuch](https://workspace.fiskaly.com/countries/germany/guides/dashboard/).

### Reihenfolge bis zum Echtbetrieb

1. Verantwortlichen Vertragspartner festlegen, Fiskaly-HUB-Account mit geschäftlicher E-Mail anlegen, Zugang absichern und technische Betreuung einladen. Preise, Vertragsbedingungen und Auftragsverarbeitung mit Fiskaly klären.
2. Zunächst ausschließlich TEST: Elias-Standort, TSS und Kassen-Client anlegen/initialisieren. Dedizierte API-Schlüssel sicher serverseitig speichern, nicht in Chat, Browser oder App-Bundle.
3. In Vercel: `FISKALY_API_KEY`, `FISKALY_API_SECRET`, `FISKALY_TSS_ID`, `FISKALY_CLIENT_ID`. Die neue Diagnose unter Einstellungen → TSE prüft Anmeldung und vorhandene TSS/Client-Zuordnung lesend. Sie erzeugt keine Verkäufe und gibt keinen Echtbetrieb frei.
4. Den **noch fehlenden SIGN-DE-Transaktionsadapter** implementieren: rechtzeitiger Vorgangsbeginn, Änderungen, Abschluss/Abbruch, Signaturdaten, eindeutige Wiederholung und Wiederanlauf nach Verbindungsabbrüchen. Nachträgliche Stornos werden neue negative signierte Geschäftsvorfälle mit Originalbezug; abgeschlossene Originale werden nicht gelöscht. [Fiskaly zu Stornos](https://support.fiskaly.com/hc/de/articles/9314648383132-SIGN-DE-Wie-ist-mit-nachtr%C3%A4glichen-Stornierungen-umzugehen).
5. DSFinV-K, vollständige TSE-Exporte und dauerhafte Archivierung einschließlich Wiederherstellungsprüfung umsetzen. **Die vorhandene CSV-Umsatzübersicht ist kein DSFinV-K-Export.**
6. Verkäufe mit gemischten Steuern, Pfand, Rabatten, Bar/Karte, Teilrückgabe, vollständigem Storno, Monatswechsel, Druckfehlern und Netzwerkabbrüchen Ende zu Ende im TEST-System prüfen. Kassenbuch einschließlich Einlagen/Entnahmen, Kassensturz und Abschluss-/Nachtragsregeln vervollständigen.
7. Bestätigte Steueridentität, Kassen-/TSE-Seriennummern, zertifizierten Betriebsumfang, Verfahrensdokumentation, Aufbewahrung, Sicherung und Ausfallkonzept mit Anbieter und Steuerberater prüfen. Erst danach LIVE separat einrichten und gezielt aktivieren.
8. Meldepflicht für elektronische Aufzeichnungssysteme fristgerecht über ELSTER/ERiC erfüllen oder eine beauftragte Meldelösung einrichten. Eine TSE übermittelt **nicht automatisch jeden Bon ans Finanzamt**. Verantwortlich bleibt der Steuerpflichtige. [BMF Kassen-FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html).

### Welche Daten werden übertragen?

Der jetzt implementierte Verbindungstest sendet API-Zugangsdaten ausschließlich an Fiskaly zur Anmeldung und liest die angegebene TSS und den Client. Er sendet keine Artikel, Kunden oder Bons. Zugangsschlüssel und Tokens werden nicht an den Browser zurückgegeben.

Der spätere Transaktionsadapter muss Kassen-/Client-ID, Vorgangs-ID und Version, Status, Geschäftsvorfall, Beträge nach Steuer und Zahlart übertragen und die von der TSE erzeugten Zeit-/Signaturdaten unverändert speichern. DSFinV-K enthält darüber hinaus detaillierte Stamm-, Einzelaufzeichnungs- und Abschlussdaten. Der genaue Datenumfang muss bei dieser noch ausstehenden Implementierung dokumentiert werden; Kundennamen sind nicht pauschal für jede TSE-Signatur erforderlich. [SIGN-DE-Dokumentation](https://workspace.fiskaly.com/countries/germany/quickstart/).

## Bondrucker Epson TM-m30II

Der Assistent und ePOS-Print über das lokale Netzwerk sind implementiert; die native iPad-App stellt dafür eine Netzwerkbrücke bereit. **Ein realer Ausdruck wurde nicht bestätigt.** In der Produktion ist noch Browserdruck gewählt und keine Druckeradresse gespeichert.

Benötigt werden die genaue Geräte-/Schnittstellenvariante, aktuelle Firmware, lokale HTTPS-Adresse und ein vertrauenswürdiges Zertifikat. Tablet und Drucker müssen im passenden lokalen Netz erreichbar sein. Im Assistenten Verbindung prüfen, Testbon mit Logo/Umlauten drucken, tatsächlichen Ausdruck bestätigen und erst dann aktivieren. Ein erfolgreiches HTTP-Ergebnis allein belegt keinen Papierausdruck. USB/Bluetooth sind durch die vorhandene Netzwerkanbindung nicht abgedeckt. Siehe auch [Druckablauf und Fehlerfälle](EPSON-UND-BEZAHLEN.md). [Epson ePOS-Technik](https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html).

## Website, Datenschutz und offene Angaben

- Inhaber, Geschäftsanschrift, Telefon, Fax und E-Mail wurden mit dem [alten Impressum](https://getraenke-elias.de/imprint.php) abgeglichen. Die dortige Angabe „DE 6507634012“ passt nicht zum Format einer deutschen USt-IdNr. und wurde nicht übernommen. Eine bestätigte USt-IdNr. bzw. Steuernummer fehlt weiterhin in den Betriebseinstellungen. Eine vorhandene USt-IdNr. muss außerdem im Impressum ergänzt werden; eine persönliche Steuernummer gehört nicht ersatzweise öffentlich ins Impressum. [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html).
- Datenschutzhinweise beschreiben Hosting, Konten, Lieferanfragen, Kommunikationshistorie, Belege, Steuerberaterzugang, notwendige Gerätespeicherung, Karten und Betroffenenrechte anhand des aktuellen Codes. AV-Verträge, tatsächliche Unterauftragnehmer, Transfergarantien, E-Mail-Anbieter und Lösch-/Aufbewahrungsprozesse müssen betrieblich bestätigt und umgesetzt werden. Eine Datenschutzerklärung ersetzt diese Maßnahmen nicht.
- Aktuell keine eingebauten Werbe-/Analysedienste; notwendige Sitzungs-/Funktionsspeicherung benötigt grundsätzlich keine Einwilligung. Google Maps lädt erst nach ausdrücklicher Freigabe und lässt sich wieder deaktivieren. Werden später Tracking, Marketing oder weitere Drittinhalte eingebaut, ist die Einwilligungslogik neu zu prüfen. [§ 25 TDDDG](https://www.gesetze-im-internet.de/ttdsg/__25.html).
- Frank Elias ist als Verantwortlicher und Datenschutzkontakt genannt, **nicht** als Datenschutzbeauftragter. Ein Inhaber entscheidet selbst über die Verarbeitung; eine unabhängige DSB-Rolle darf keine Interessenkollision haben. Ob ein eigener Datenschutzbeauftragter erforderlich ist, hängt unter anderem von Personalumfang und Verarbeitung ab und ist noch zu klären. [§ 38 BDSG](https://www.gesetze-im-internet.de/bdsg_2018/__38.html), [Datenschutzaufsicht Baden-Württemberg zu Interessenkonflikten](https://www.baden-wuerttemberg.datenschutz.de/faq-datenschutz-in-der-pflege/).
- Produktbilder enthalten dokumentierte Quellen. Dies ist **kein Nachweis von Nutzungsrechten**; Freigaben/Lizenzen der verwendeten Hersteller-/Händlerbilder müssen bestätigt werden.
- Aufbewahrung unterscheidet Dokumentarten (regelmäßig zehn, acht oder sechs Jahre); Löschregeln und Fristverlängerungen sind fallbezogen einzurichten. [§ 147 AO](https://www.gesetze-im-internet.de/ao_1977/__147.html).

## Prüfung und Grenzen

48 Unit-Tests, Datenbankprüfungen mit allen Migrationen einschließlich Teilstorno, Rechteprüfung, Rücknahmefrist, Bestandswahl und Rundung sowie Browserprüfung der Einstellungen, PDF-Anzeige und Rückgabe auf Tabletformaten. Finanzbericht (drei Querformatseiten) und Gegenbon wurden als PDF gerendert und visuell kontrolliert. Alle Buchungsfälle verwenden isolierte Testdaten, keine Produktionsverkäufe.

Die TSE-Diagnose, PDF-Archivierung und neuen Gegenbelege machen die Kasse noch nicht zu einer fertig fiskalisierten Registrierkasse. Echte Verkäufe/Stornos bleiben bis zur vollständigen Umsetzung und Betriebsabnahme gesperrt. Die fachliche Schlussprüfung sollte anhand echter Betriebsdaten mit Steuerberater und Fiskaly erfolgen; eine hundertprozentige juristische Garantie kann aus dieser technischen Prüfung nicht abgeleitet werden.
