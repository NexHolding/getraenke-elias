# Kundenportal, Lieferabos und Auslieferung

Stand: 21. September 2026. Die Kasse und Lieferbelege verbleiben im Einrichtungsmodus. Keine echten Bestellungen oder Finanzbuchungen wurden für die Prüfung erzeugt.

## Bedienung

Das Kundenkonto in Website und iOS-Kunden-App hat eigene Bereiche für **Profil, Lieferabos, Bestellverlauf, Lieferscheine, Rechnungen und Kommunikation**. In der nativen Kunden-App entfallen die zusätzliche Website-Kopfzeile und der große Website-Fußbereich. Die bestehende App lädt diese Oberfläche vom Server; unter „Mein Konto“ mit „Konto aktualisieren“ neu laden. Es wurde dafür kein neues TestFlight-Binary benötigt.

Lieferabos lassen sich unter „Lieferabos → Lieferabo anlegen“ zusammenstellen: Artikel suchen, Mengen festlegen, Rhythmus und Starttermin wählen, optional einen Lieferhinweis hinterlegen. Kunden benötigen eine vollständige Lieferadresse, Telefonnummer und mindestens vier Getränkekisten. Diese bestehende Lieferbedingung wird jetzt sichtbar angezeigt. Pausieren funktioniert auch bei inzwischen unvollständigen Stammdaten oder nicht mehr verfügbaren Artikeln. Zum Fortsetzen einen gültigen nächsten Termin wählen.

Kundenabos erzeugen zum Fälligkeitstag unverbindliche Lieferanfragen; der Betrieb bestätigt Verfügbarkeit und Termin. Das vermeidet einen unbemerkten Wechsel vom bisherigen Anfrageverfahren zu verbindlichen Onlineverträgen. Mitarbeiter und Inhaber können Abos in der Kundenakte direkt zwischen Profil und Bestellverlauf verwalten. Dafür genügt die Berechtigung „Kunden“ oder „Bestellungen“; reine Finanzzugänge dürfen keine Abos ändern. Mitarbeiterabos behalten den bestehenden betrieblichen Bestellablauf. Die bisherige manuelle Bestellung mit optionalem Lieferintervall bleibt zusätzlich vorhanden.

Automatische Folgeaufträge entstehen beim geplanten Automatiklauf (derzeit stündlich). Pro Abo und Termin gibt es höchstens einen Auftrag. Monatliche Rhythmen behalten ihren Kalendertag nach kurzen Monaten bei. Bei übersprungenen Fälligkeiten wird ein aktueller Auftrag erzeugt, keine Serie nachträglicher Doppellieferungen. Preise und Pfand werden aus dem bei Auftragserstellung aktuellen Artikelbestand übernommen.

## Ablauf für den Fahrer

1. Bestätigte Bestellungen unter „Lieferplanung“ einem Liefertag zuordnen. Zukünftige Wunschtermine werden nicht vorgezogen. Zeitfenster, Abstellgenehmigung, noch offene Mengen und Beladereihenfolge bleiben sichtbar.
2. Lieferschein öffnen und die tatsächlich übergebenen Mengen prüfen/ändern. „Entwurf speichern“ erzeugt noch keine Rechnung und bucht keinen Lagerabgang.
3. Empfängernamen eintragen und den Kunden im Signaturfeld unterschreiben lassen. Ohne Unterschrift ist eine bestätigte, gespeicherte Abstellgenehmigung erforderlich.
4. „Ware übergeben & Belege erstellen“ bestätigt die Lieferung. Das System bucht den Lagerabgang, aktualisiert offene Mengen und erzeugt einen Lieferschein sowie eine Rechnung über genau diese Lieferung.
5. Die Dokumente erscheinen im Kundenportal, in der Kundenakte und – für Rechnungen – in der Finanzübersicht. Teil- und Restlieferungen erhalten eigene Belege, ohne die früheren Lieferscheine umzuschreiben.

Unklare Serverantworten werden mit derselben Lieferkennung erneut geprüft. Wiederholungen buchen weder Bestand noch Rechnung noch Versandauftrag ein zweites Mal. Gegen gleichzeitige Aboänderungen schützen Versionsprüfungen; gegen wiederholte Abo-Speicherbefehle eindeutige Vorgangskennungen.

## Dokumente und E-Mail

Rechnung und Lieferschein haben das Elias-Logo, ein helles Layout, Beleg-/Auftragsnummern und gespeicherte Empfänger-/Betriebsangaben. Die Rechnung enthält Netto, Brutto, Steueraufteilung und Pfand. Der Lieferschein enthält gelieferte und verbleibende Mengen sowie die Empfangsbestätigung. Bereits vorhandene Steuer-/Einrichtungsgrenzen gelten unverändert.

Die neuen PDF-Archive speichern die erzeugten Bytes mit SHA-256-Prüfsumme. Kundenportal, CRM und E-Mail nutzen dieselbe archivierte Datei. Bereits archivierte Versandanhänge werden beim erstmaligen Aufbau des neuen PDF-Archivs übernommen. Entwürfe werden nicht als unveränderbare unterschriebene Dokumente archiviert. Bei einer vorübergehenden PDF-Störung bleibt die bereits gebuchte Lieferung bestehen; PDF-Abruf und Versand können die Aufbereitung erneut versuchen.

Beide Dokumente werden nach bestätigter Übergabe automatisch für den Versand eingeplant. Die bisherige optionale Rechnungs-E-Mail-Einstellung wird dafür nicht mehr angeboten. Die Kommunikationshistorie enthält Versandauftrag, Status und archivierte Anhänge. Ein fehlender Mailserver verhindert weder Belegerstellung noch Portalzugang. Bestellbestätigungen werden auch bei noch nicht eingerichtetem SMTP sichtbar in die Warteschlange aufgenommen.

Der Versandworker läuft derzeit alle fünf Minuten und sendet nur bei aktiviertem, korrekt eingerichtetem SMTP. **„An Mailserver übergeben“ ist eine Annahmebestätigung des Servers, kein Nachweis der Zustellung im Posteingang.** Bei unklarer SMTP-Antwort erfolgt kein blinder automatischer Wiederholungsversand.

## Offener tatsächlicher Versandtest

Freigegebener Testempfänger: **poststelle@nex-consulting.de**. Geprüfter aktueller Zustand: SMTP deaktiviert, Host, Benutzer und Absender fehlen. Es wurde keine Test-E-Mail verschickt.

Der Supabase-Standardversand unterstützt Authentifizierungsnachrichten und ist ohne eigenen SMTP-Anbieter auf Projektteam-Adressen beschränkt. Er ist kein allgemeiner Versanddienst für Rechnungen/Lieferscheine mit PDF-Anhängen. Auch für einen vorübergehenden echten Test ist ein geeigneter SMTP-/Transaktionsmail-Anbieter erforderlich. Später lässt sich derselbe Anschluss auf den Anbieter von Getränke Elias umstellen. [Supabase: SMTP für Authentifizierung](https://supabase.com/docs/guides/auth/auth-smtp).

Nach Einrichtung: SMTP-Verbindung prüfen, ausschließlich gekennzeichnete Testdokumente an die freigegebene Adresse senden, Versandhistorie/Anhänge kontrollieren und den Empfang inklusive PDF-Öffnung durch den Empfänger bestätigen lassen. Zugangsdaten nur in den geschützten Einstellungen hinterlegen.

## Verifikation

- Alle Migrationen in isoliertem PostgreSQL: Kunden-/Mitarbeiterabo, Eigentumsprüfung, Rechte, Mindestmenge, konkurrierende Änderung, wiederholter Speicherbefehl, Fälligkeit und Pausieren.
- Realer Planungsalgorithmus mit Testauftrag; Entwurf, unterschriebene Teil- und Restlieferung, wiederholter Abschluss, einmaliger Lagerabgang und genau eine Rechnung je Übergabe.
- Zuordnung zu Kunde, Auftrag, Kommunikation und Finanzbericht; gespeicherte historische Adressen/Mengen bleiben nach Folgeänderungen erhalten.
- Echter Versandworker mit isolierter SMTP-Gegenstelle: Versandannahme, Fehlerzustand, Wiederholungsschutz und identische archivierte/übermittelte PDF-Bytes. Keine externen Nachrichten.
- Echte React-Komponenten mit isolierten API-Testdaten: iPhone-Ansicht und native Browserbrücke, Aboanlage/Pause, CRM-Kundenakte auf iPad-Größe, PDF.js-Anzeige im selben Fenster, gezeichnete Unterschrift und bestätigter Lieferabschluss.
- Rechnung und signierter Lieferschein wurden als PDF gerendert und visuell kontrolliert.

Prüfskripte: `npm test`, `npm run test:db` und `node --import tsx scripts/verify-customer-delivery.mjs`. Ein erfolgreicher isolierter Test ersetzt weder den tatsächlichen E-Mail-Empfang noch einen Test auf dem physischen Fahrergerät.
