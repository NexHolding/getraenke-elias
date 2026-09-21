# Kassenabschluss und Kassenbuch

## Bedienung

In der Kasse öffnet **Kassenabschluss · Tagesbericht** den Bargeldbereich. Mitarbeiter mit Kassenzugang können den Anfangsbestand bestätigen (erster Vorschlag: 250 €). An den folgenden Geschäftstagen wird der zuletzt bestätigte Wechselgeldbestand vorgeschlagen. Abweichende Anfangsbestände benötigen eine Erläuterung und werden als eigene Buchung dokumentiert.

Ab der ersten Öffnung werden alle neuen Barverkäufe, Pfandrücknahmen und Barerstattungen/Stornos automatisch einmalig im Kassenbuch erfasst. Bereits am Aktivierungstag vorhandene Barbons werden einmalig übernommen. Für frühere Tage wird kein unbekannter Anfangsbestand erfunden. EC-/SumUp-Zahlungen verändern den Bargeldbestand nicht.

Einlagen und Entnahmen werden mit Betrag, Richtung, Verwendungszweck, Kategorie, Belegdatum und Bearbeiter gebucht. Betriebsausgaben benötigen einen gespeicherten Beleg (PDF/JPEG/PNG, maximal 2 MB) oder eine Papier-/Eigenbelegreferenz. Dokumente liegen zugriffsgeschützt und mit Prüfsumme in der Datenbank. Das Belegdatum ist vom unveränderlichen Erfassungszeitpunkt getrennt. Negative Buchbestände werden verhindert. Vorsteuer und Kontenzuordnung werden nicht aus einem hochgeladenen Bild geraten; diese Prüfung erfolgt anhand der Belege durch die Buchhaltung.

Zum Abschluss wird der tatsächliche Barbestand eingegeben. Sollbestand, gezählter Bestand und Differenz erscheinen unmittelbar. Auch eine Prüfung ohne Differenz wird dokumentiert. Der nächste Anfangsbestand kann beispielsweise auf 250 € gesetzt werden. Die dazu notwendige Abschöpfung oder Wechselgeldeinlage wird separat angezeigt und verlangt die Bestätigung, dass das Bargeld tatsächlich umgelegt wurde, einschließlich Ziel bzw. Herkunft (z. B. Tresor).

Nach Abschluss sind die Tageskasse und ihre Einträge festgeschrieben. Derselbe Tag kann nicht erneut geöffnet werden. Weitere Verkäufe werden abgewiesen; vor dem Bezahlfenster wird der Kassenstatus geprüft. Am nächsten Tag ist zuerst die neue Tageskasse zu öffnen. Eine noch offene ältere Tageskasse muss über Finanzen mit entsprechendem Tag ausgewählt und abgeschlossen werden.

Korrekturen manueller Bewegungen erfolgen durch Gegenbuchungen mit Bezug auf das Original. Bereits im Kassenbuch enthaltene Kassenbons und Zahlungsnachweise dürfen auch im Einrichtungsmodus nicht verändert oder gelöscht werden. Die Demo-Rücksetzung wird nach erstmaliger Einrichtung des Kassenbuchs gesperrt, damit zugehörige Nachweise nicht verloren gehen.

## Lieferbargeld

Die optionale Rückfrage zur Behandlung von Lieferbargeld wurde noch nicht beantwortet. Um den physischen Ladenbestand nicht vorzeitig zu erhöhen, wird bar kassiertes Geld aus Lieferrechnungen zunächst separat angezeigt. **Übergabe bestätigen** übernimmt die konkrete Zahlung genau einmal in die Ladenkasse, sobald der Fahrer das Geld tatsächlich übergibt. Negative Lieferabrechnungen (Pfanderstattung) verringern diesen Übertrag. Diese Bewegung ist kein neuer Umsatz; Rechnung und Zahlung bleiben in der vorhandenen Buchhaltung dokumentiert.

## Finanzen und Steuerberater

Das Kassenbuch ist in **Finanzen** zum ausgewählten Tag oder Monat sichtbar. Es gibt einen eigenen CSV-Export und einen hell gestalteten PDF-Bericht im Querformat mit Elias-Logo. Die PDF wird im eingebauten Betrachter angezeigt und lässt sich drucken oder herunterladen. Die Berichte enthalten Anfangsbestand, Soll/Ist-Abgleich, Differenz, nächsten Anfangsbestand sowie die einzelnen Bewegungen mit Referenz und Bearbeiter.

**Kassenbuch im Tages- / Monatsbericht mit ausgeben** ergänzt die bestehende Finanz-PDF um einen Anhang bzw. die Finanz-CSV um eigene Kassenbuchspalten und -zeilen. Bargeldüberträge oder Ausgaben werden dabei nicht noch einmal als Umsatz gezählt. Der Steuerberaterzugang erhält dieselbe lesende Ansicht und Exportmöglichkeiten; Buchungen, Abschlüsse und Gegenbuchungen sind dort sowohl im API als auch in der Datenbank gesperrt.

## Technische Absicherung

Migration 032 ergänzt `cash_days`, `cash_entries`, `cash_documents` und `cash_commands`. Bestehende Geschäftsdatensätze werden nicht umgeschrieben. Tageskassen werden erst durch eine bewusste Anfangsbestätigung angelegt. Die Buchungsfunktionen verwenden dieselbe transaktionale Sperre wie Verkäufe und Lieferungen. Eindeutige Vorgangskennungen verhindern Doppelbuchungen, auch nach Verbindungsabbruch; ein unklarer Vorgang bleibt im Browser für den betreffenden Mitarbeiter zur erneuten Prüfung gespeichert. Neue Buchungen während einer Zählung machen die Abschlussfreigabe ungültig. Der Server berechnet sämtliche Salden selbst.

Einrichtungs- und Echtdaten bleiben getrennt. Die vorhandene TSE-/Echtbetriebsfreigabe wird nicht umgangen. Diese Erweiterung ist keine TSE-Zertifizierung und ersetzt nicht die noch ausstehende Freigabe des fiskalischen Echtbetriebs.

## Rechtlicher Bezug

Die tägliche Erfassung und nachvollziehbare Korrektur orientieren sich an [§ 146 AO](https://www.gesetze-im-internet.de/ao_1977/__146.html). Zur Abgrenzung Kassenbuch/Kassenfunktion und Kassen-Nachschau wurden die [BMF-Informationen zur Belegpflicht](https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html) geprüft (21.09.2026). Eine ordnungsgemäße Nutzung erfordert auch tatsächliche Bargeldzählung, Belegaufbewahrung, organisatorische Abläufe und die bestehende TSE-Einrichtung.

## Prüfung

- 61 Modultests einschließlich Berichtssummen und Schutz vor CSV-Formeln.
- Gesamte bisherige Datenbank-Testreihe plus Kassenbuchfälle: Berechtigungen, unveränderliche Belege, negative Bestände, Bar-/EC-Trennung, Erstattung, Belegupload, Gegenbuchung, idempotente Vorgänge, veraltete Zählung, Zähldifferenz, Abschöpfung, Tagesübertrag und Liefergeldübergabe.
- Isolierter Browserablauf auf iPad-Größe: Öffnen mit 250 €, 10 € Porto mit Beleg, Barumsatz, -5 € Zähldifferenz, 85 € Abschöpfung auf 250 € Wechselgeld, Abschluss, Sperre vor neuem Bezahlfenster, PDF-Anzeige sowie Steuerberater-Export mit/ohne Kassenbuch.
- PDF-Seiten gerendert und visuell geprüft; ESLint und Produktionsbuild erfolgreich.
- Keine echten Kassenbuchungen, Bestellungen, Rechnungen oder E-Mails durch die Tests.

Die iPad-Kasse verwendet diesen veröffentlichten Web-Arbeitsbereich; für die Funktion ist kein neuer TestFlight-Build erforderlich.
