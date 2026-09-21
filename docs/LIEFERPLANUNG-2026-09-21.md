# Lieferplanung: Mindestvorlauf und aktuelle Zeitfenster

Neue Bestellungen sind frühestens am nächsten Kalendertag in der Zeitzone Europe/Berlin planbar. Das gilt für Website/Kunden-App, Mitarbeiterbestellungen und automatisch erzeugte Abo-Aufträge. Liefertage, spätere Wunschtermine und Kundenzeitfenster gelten zusätzlich; morgen ist kein pauschal zugesagter Liefertermin.

## Umsetzung

- Gemeinsame Datumsberechnung in `lib/delivery-date.ts`; Kalenderwechsel einschließlich Sommerzeit, Monats- und Jahreswechsel ohne pauschale 24-Stunden-Addition.
- `planDay` berücksichtigt den Bestelleingang und für heutige Touren die aktuelle Ortszeit einschließlich Fahrzeit. Vergangene Tage und abgelaufene Kundenzeitfenster sind ausgeschlossen. Fehlender Bestelleingang wird zur Prüfung zurückgestellt.
- Mitarbeiterbestellungen und Lieferabos starten im Formular mit morgen; frühere neue Termine sind ungültig. Der Shop erklärt den Mindestvorlauf vor und nach der Anfrage.
- Migration `202609170033_delivery_lead_time.sql` sichert neue Wunschtermine, Tourzuweisungen und Abotermine in der Datenbank ab. Allgemeine Anfragen ohne Wunschtermin bekommen keinen erfundenen Kundenwunsch zugewiesen.
- Wiederkehrende Bestellungen werden einen Tag vor ihrem Termin erzeugt. Versäumte Läufe holen höchstens einen Auftrag je Abo nach, frühestens für morgen; Wiederholungskennung und Rhythmus bleiben erhalten. Wiederholung desselben Laufs erzeugt keine Doppelbestellung.
- Bei manueller Neuplanung entfallen nicht mehr passende alte Routenplätze. Bereits fahrende Touren werden nicht neu geplant. Die Automatik verbraucht ihren Tageslauf nicht, solange kein Auftrag planbar ist.
- Die Migration entfernt ausschließlich ungültige, noch nicht gestartete Routenplätze mit Audit-Eintrag. Abgeschlossene Lieferungen, Rechnungen und laufende Touren werden nicht rückwirkend verändert.

## Prüfung

65 Unit-Tests; vollständige isolierte Datenbank-Testreihe einschließlich neuer Vorlaufprüfung; Browserprüfung der echten React-Formulare und des gemeinsamen Planers auf iPad- und Handyformat. Keine echten Testbestellungen, Warenbewegungen oder Kunden-E-Mails.

Migration vor Produktionsveröffentlichung anwenden. Website und die eingebetteten CRM-/Kundenansichten der iOS-Apps verwenden denselben aktualisierten Stand; hierfür ist kein neuer nativer TestFlight-Build erforderlich.
