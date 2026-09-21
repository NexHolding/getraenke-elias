# Kundenkonten, Lieferzahlungen und Mahnungen

## Kundenstamm und Zugang

Die Kundenakte zeigt Online-Account aktiv, Bestätigung ausstehend oder kein Online-Account sowie die Login-E-Mail. Nur das Vorhandensein eines Passworts wird abgefragt und maskiert dargestellt. Ein Passwort oder Passwort-Hash wird nie an den Browser geliefert. Mitarbeitende mit Kundenrechten und Inhaber können einen persönlichen Zugangslink anfordern. Bestätigte Konten erhalten einen Recovery-Link; neue Konten eine Einladung. Unbestätigte Registrierungen mit Passwort erhalten eine erneute Bestätigung. Ein Link ist nur einmal verwendbar und wird im Kommunikationsarchiv durch einen Platzhalter ersetzt. Der verschlüsselte Versandinhalt wird nach einem abschließenden Versandstatus entfernt. Eine Sperre verhindert mehrere Anfragen innerhalb einer Minute.

Registrierung und Passwort-vergessen verwenden weiter Supabase Auth. Die aktuelle lesende Prüfung bestätigt: Registrierung erlaubt, E-Mail-Anmeldung aktiv und E-Mail-Bestätigung erforderlich. Der CRM-Versand ist jedoch noch nicht eingerichtet (SMTP deaktiviert, Host/Benutzer/Absender fehlen). Es wurde kein realer Versand behauptet oder ausgeführt. Testempfänger für den späteren echten Ablauf bleibt poststelle@nex-consulting.de. Supabases Standard-SMTP ist kein allgemeiner Rechnungs-Maildienst: https://supabase.com/docs/guides/auth/auth-smtp

## Bestellbestätigung und Termin

Jede neue Bestellung bzw. Lieferanfrage erzeugt eine archivierte E-Mail mit Artikeln, Mengen, Beträgen inklusive Pfand, Summe, Lieferadresse und geplantem oder gewünschtem Liefertermin. Ein Wunschdatum wird nicht als bestätigter Termin ausgegeben. Falls noch kein Termin existiert, nennt die Nachricht die ausstehende Tourenplanung. Die Annahme einer Anfrage und Änderungen der geplanten Lieferzeit erzeugen zusätzliche Informationen mit dem aktuellen Termin. Gleichlautende Wiederholungen werden dedupliziert. Kundenbestellungen bleiben bis zur Annahme Lieferanfragen.

## Zahlungsart und Lieferung

Unter Kunden → Bearbeiten wird Bar, EC oder Rechnung festgelegt. Bestehende Kunden starten mit Rechnung, passend zum bisherigen offenen Rechnungsablauf; die Zahlungsart wird nicht aus früheren Umsätzen geraten. Kunden können diese Vorgabe nicht selbst über das Profil ändern.

Die Tour zeigt die Zahlungsart. Bei Bar/EC muss der Fahrer den vollständigen Betrag für die tatsächlich gelieferten Mengen bestätigen. Bar und EC sind vor Ort umschaltbar; EC bleibt das separate Gerät ohne SumUp-Anbindung. Eine Mengen- oder Zahlartänderung setzt die Bestätigung zurück. Rechnungskunden werden nicht vor Ort abkassiert. Bei zwischenzeitlich geänderter Kundenzahlungsart wird die Buchung zurückgewiesen, bis die Lieferung neu geöffnet wurde.

Lieferung, Lagerabgang, Rechnung und gegebenenfalls Zahlung werden in einer Transaktion verbucht. Wiederholung derselben Lieferung erzeugt keine zweite Zahlung. Sofort bezahlte Rechnungen werden bereits als bezahlt archiviert. Der bestehende Echtbetriebs-/TSE-Schutz wird nicht aufgehoben.

## Rechnungen und Zahlungseingänge

Neue Rechnungen erhalten ein unveränderliches Zahlungsziel (Standard 14 Tage) und Fälligkeitsdatum. Einstellung: Einstellungen → Auslieferung. Änderungen wirken auf neue Rechnungen. Altbelege ohne vereinbartes Zahlungsziel werden nicht nachträglich mit einem erfundenen Fälligkeitsdatum versehen.

Finanzen → Lieferrechnungen zeigt Betrag, Kundenname, Rechnungsdatum, Fälligkeit und Status. Offen, überfällig und Mahnstufen sind durch Text, Symbol und Farbe erkennbar; bezahlt trägt ein Geldsymbol. Nur der Inhaber kann den vollständigen manuellen Eingang mit Datum und Bar/EC/Überweisung bestätigen. Die Buchung ist serverseitig gegen doppelte Ausführung geschützt und im unveränderlichen Zahlungsjournal mit Bedienung, Betrag und Zeitpunkt dokumentiert. Teilzahlungen sind nicht Bestandteil dieser Funktion.

Die Rechnung zählt bei Erstellung zum Rechnungsumsatz, unabhängig vom Zahlungseingang. Zahlungseingänge werden nach ihrem tatsächlichen Zahlungstag zusätzlich im PDF-/CSV-Zahlungsjournal ausgewiesen, ohne erneut Umsatz oder Umsatzsteuer zu erzeugen. Fahrer-Barzahlungen bleiben als Lieferinkasso separat vom stationären Kassenumsatz ausgewiesen; die physische Übergabe von Fahrer-Bargeld in die Ladenkasse ist kein zweiter Verkauf.

## Mahnfolge

- 1. Mahnung: am Tag nach Fälligkeit, Berechnung in Europe/Berlin.
- 2. Mahnung: frühestens sieben Kalendertage nach Versand der 1. Mahnung.
- 3. Mahnung: frühestens sieben Kalendertage nach Versand der 2. Mahnung.
- Höchstens eine E-Mail je Rechnung und Stufe, mit Originalrechnung als archiviertem PDF-Anhang.
- Keine automatischen Gebühren oder Inkassomaßnahmen.
- Kein weiterer Schritt bei fehlgeschlagenem oder unklarem Versand; dies bleibt sichtbar und muss geprüft werden.
- Bezahlung stoppt zukünftige Mahnungen und verwirft noch ausstehende Mahnungen. Der Versanddienst prüft den offenen Status nochmals unmittelbar vor dem Senden. Eine bereits an den Mailserver übergebene Nachricht kann nicht zurückgerufen werden.
- Nur echte, offene Rechnungen mit Zahlungsart Rechnung und gespeichertem Fälligkeitsdatum sind mahnfähig. Einrichtungsbelege sind ausgeschlossen.
- Die Automatik ist unter Einstellungen → Auslieferung abschaltbar. Der bestehende geschützte Mail-Cron prüft alle fünf Minuten. Weitere Stufen warten auf tatsächlichen Versand der vorherigen Nachricht, sodass nach SMTP-Ausfällen keine Mahnungen gebündelt verschickt werden.

## Validierung und Veröffentlichung

Migration 026 ergänzt Tabellen/Funktionen; bestehende Geschäftsinhalte bleiben unverändert. Getestet wurden vollständige Migrationskette, SQL-Berechtigungen, Bestands-/Rechnungs-/Zahlungstransaktion, abweichende Zahlungsart, Bestätigungszwang, unveränderliche Fälligkeit, Idempotenz, Mahnstufen und Zahlungsstopp, Daten ohne Geheimnisse sowie periodengetrennte PDF-/CSV-Auswertung. Die realen Mailworker wurden mit isoliertem SMTP geprüft, einschließlich verschlüsselter Zugangsmails und bytegleichem Rechnungsanhang. Browserprüfungen umfassen Kundenakte, Zahlungsziele, Rechnungsliste, Zahlungsdialog, Fahreransicht, PDF-Vorschau und Telefonbreite.

Web und iPad-App laden dieselbe Oberfläche. Dafür ist kein neuer TestFlight-Build erforderlich; die bestehende App muss die Seite neu laden.
