# Manuelle Zusatzbestellungen beim Lieferanten

Unter **Einkauf → Zusatzbestellung anlegen** können Inhaber/Admins und aktive Mitarbeiter mit dem Modulrecht **Einkauf** zusätzliche Artikel beim Lieferanten bestellen. Reine Finanzzugänge und Mitarbeiter ohne Einkaufsrecht sind serverseitig gesperrt.

## Erfassung

Lieferant auswählen, Artikel suchen und Mengen in den angezeigten Gebinden eingeben. Möglich sind beispielsweise **100 Kisten Cola**. Optional: gewünschter Liefertermin, Bezug zu einem Kundenauftrag und Hinweise an den Lieferanten. Angeboten werden aktive Artikel des ausgewählten Lieferanten und Artikel ohne feste Lieferantenzuordnung. Die Artikelstammdaten werden dadurch nicht geändert.

**Zusatzbestellung als Entwurf speichern** legt genau eine Bestellung mit der Kennzeichnung „Manuelle Zusatzbestellung“ an. Auch bei aktivierter automatischer E-Mail-Freigabe des Lieferanten wird dieser Entwurf nicht selbständig versendet.

Anschließend stehen folgende Aktionen bereit:

- **Bestellung per E-Mail senden:** ausdrücklicher Versandauftrag über den konfigurierten SMTP-Server an die Bestelladresse des Lieferanten. Die E-Mail benennt den zusätzlichen Bedarf, Artikel, Mengen, Lieferwunsch und Bezug. Die Freigabe beeinflusst den Automatikschalter des Lieferanten nicht.
- **Als extern bestellt markieren:** dokumentiert beispielsweise eine bereits telefonisch oder im Lieferantenportal aufgegebene Bestellung. Es wird keine E-Mail versendet.
- **Entwurf stornieren:** beendet einen noch nicht aufgegebenen Entwurf.
- **Wareneingang buchen:** für Entwürfe oder versendete/extern bestellte Aufträge, nach ausdrücklicher Bestätigung der tatsächlich erhaltenen Mengen. Ein vorheriger Istbestand ist erforderlich. Wiederholtes Buchen derselben Bestellung erhöht den Bestand nicht erneut.

Der Einkauf zeigt den E-Mail-Status einschließlich fehlgeschlagenem oder unklarem Versand. Ein unklarer Versand wird nicht automatisch nochmals ausgelöst; zuerst den tatsächlichen Postausgang prüfen.

## Verhältnis zur Bestellautomatik

Die Automatik zieht ausschließlich offene **automatische** Bestellungen vom normalen Bedarf ab. Manuelle Zusatzbestellungen werden in keinem offenen Status (Entwurf, Versandwarteschlange, versendet) angerechnet.

Beispiel: Bestand 2 Kisten, Zielbestand 12, bereits automatisch bestellt 3 → die Automatik bestellt weitere **7 Kisten**. Eine separate manuelle Bestellung über **100 Kisten** verändert diese Rechnung nicht.

Manuelle Erfassung, Versand und Stornierung ändern weder Mindest-/Zielbestände, Artikel-Lieferantenzuordnung, Automatikfreigaben noch Bestellzeiten oder Laufprotokolle. Beim tatsächlichen Wareneingang wird der physische Lagerbestand korrekt erhöht. Künftige Bestandsprüfungen verwenden diesen tatsächlichen Bestand; diese Funktion ist keine Reservierung für einen Kundenauftrag.

## Technische Prüfung

Migration `202609170021_manual_purchases.sql`: Herkunft und Zusatzinformationen an Lieferantenbestellungen, atomare und gegen Doppelübermittlung geschützte Anlage, Berechtigungsprüfung in den RPCs, explizite Versandsteuerung, Auditnachweis sowie Ausschluss manueller Mengen aus der bestehenden Bedarfsberechnung.

`node scripts/validate-manual-purchases.mjs` prüft das 100-Kisten-Beispiel, alle offenen Status, Berechtigungen, Wiederholungen, Lieferantenzuordnung, unveränderte Stammdaten/Automatiktermine und einmaligen Wareneingang in einer isolierten Datenbank. `node scripts/validate-mail-workers.mjs` prüft den tatsächlichen Mail-Worker mit isoliertem SMTP-Adapter ohne externe E-Mails.
