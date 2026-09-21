# Liefermengen, Lieferliste und Zahlungsfreigabe

## Verhalten
- Website und eingebetteter Bestellabschluss der Kunden-App verlangen eine bewusste Zahlungswahl: Bar, EC-Karte oder Rechnung anfragen. Es ist nichts vorausgewählt.
- Neue Kunden erhalten keinen automatischen Rechnungskredit. Der neue Datenbank- und Formularstandard ist Barzahlung. Bestehende Kunden werden nicht geändert.
- Bestellungen speichern Kundenwunsch und freigegebene Zahlungsart getrennt. Mitarbeiter mit Bestellberechtigung und Inhaber bestätigen oder ändern diese ausdrücklich; Änderungen werden protokolliert. Die Freigabe gilt für den Auftrag, unabhängig von späteren Änderungen der Kundenstammdaten.
- Die dauerhafte Kundenvorgabe bleibt in Kunden → Profil → Zahlungsart editierbar. Bei bereits bestätigten Aufträgen die Zahlungsart zusätzlich am Auftrag ändern. Für Restlieferungen lässt sie sich ebenfalls ändern; abgeschlossene Rechnungen bleiben unverändert.
- Bestätigungsnachrichten und Kundenportal zeigen die freigegebene Zahlungsart. Nachrichten werden über den bestehenden Mailausgang eingeplant; tatsächlicher Versand benötigt dessen Einrichtung.
- Vor Abschluss einer Lieferung: tatsächliche Mengen eingeben oder „Nicht dabei“ wählen, Entwurf speichern und erst danach Übergabe bestätigen. Fehlmengen bleiben offen. Mengenänderungen löschen Unterschrift und Zahlungsbestätigung.
- Nur gelieferte Mengen verändern Bestand und Rechnung. Ein Lieferschein zeigt alle bestellten Artikel mit bestellter, gelieferter und offener Menge. Bereits abgeschlossene Belege bleiben unveränderbar.
- Lieferliste drucken erzeugt eine eigene A4-PDF im Querformat für den ausgewählten Tag. Sie zeigt Stopps, Adresse, Zeitfenster, offene Mengen, Zahlungsart und geplanten Gesamtbetrag inklusive Pfand. Browser: PDF-Vorschau und Drucken. iOS: PDF drucken/teilen über den vorhandenen nativen Dokumentdialog.

## Migration und Sicherheit
Migration 029 ergänzt Zahlungswunsch, Freigabe und Versionsnummer je Auftrag. Bereits angenommene Altaufträge übernehmen ihre bisherige Kundenzahlungsart; neue Anfragen müssen freigegeben werden. Bestehende Kundenvorgaben, Artikel, Bestände, Rechnungen und Zahlungen werden nicht verändert.
Die RPC ist ausschließlich für den Service-Rollenaufruf mit aktiver Mitarbeiterberechtigung freigegeben. Veraltete Freigaben werden zurückgewiesen. Auslieferung gegen eine zwischenzeitlich geänderte Zahlungsfreigabe wird blockiert. Doppelte Abschlussanfragen erzeugen keine weitere Rechnung oder Bestandsbuchung.

## Prüfung
- 55 Modultests, sämtliche Datenbank-Prüfprogramme, ESLint und Produktionsbuild.
- Neuer Datenbanktest: Zahlungsfreigabe und Rechte, konkurrierende Änderung, Profiländerung ohne Auftragsänderung, unbearbeitete Zahlungsfreigabe, Teil-/Nullmengen, Bestandsabzug, genau eine Rechnung/Zahlung bei Wiederholung, unveränderbare abgeschlossene Dokumente.
- Browserprüfung mit echten Komponenten und isolierten API-Fixtures: Kundenformular vollständig senden, Rechnung anfragen und Bar freigeben, Liefermengen ändern/Entwurf speichern, Zahlungsbestätigung zurücksetzen, Lieferliste anzeigen/drucken, ein- und mehrseitige PDFs rendern.
- Finanzielle Tests ausschließlich in isolierter Datenbank. Keine echten Testbestellungen, Rechnungen oder E-Mails erzeugt. Physische Druckausgabe und ein echter Versand mit eingerichtetem Mailanbieter sind vor Ort zu prüfen.
- Web-Arbeitsbereiche werden in den bestehenden iOS-Apps geladen. Dafür ist kein neues TestFlight-Binary nötig; den Arbeitsbereich neu öffnen.
