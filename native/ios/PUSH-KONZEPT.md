# Kunden-Push · Konzept vom 21.09.2026

Planungsstand, noch kein aktiver APNs-Versand. Kundenbestellungen sind Lieferanfragen. Die bloße Eingangsbestätigung darf keine Annahme oder bereits erfolgte Zahlung behaupten.

| Ereignis | Beispiel | Auslösung / Ziel |
|---|---|---|
| Anfrage angenommen | „Deine Lieferung ist bestätigt. Den Termin findest du in der App.“ | Erst bei ausdrücklicher Annahme im CRM, öffnet eigene Lieferung. |
| Liefertermin geändert | „Für deine Lieferung gibt es einen neuen Termin.“ | Nur bei tatsächlicher Änderung, öffnet aktualisierte Lieferung. |
| Rückfrage / Ersatzartikel | „Elias hat eine Rückfrage zu deiner Lieferung.“ | Mitarbeiter löst Kundenrückfrage aus; öffnet geschützte Kommunikation. |
| Lieferung unterwegs | „Deine Getränke sind unterwegs.“ | Erst bei gepflegtem Tourstatus; Zeitfenster nur anzeigen, wenn verlässlich vorhanden. |
| Lieferabo steht an | „Deine nächste Lieferung steht an. Jetzt prüfen oder pausieren.“ | Einmal vor dem Änderungsstichtag; ohne vorhandenen Stichtag noch keine automatische Erinnerung. |
| Angebote | „Neue Angebote bei Elias entdecken.“ | Getrennte, ausdrückliche Werbeeinwilligung; standardmäßig aus. |

## Gestaltung

- Berechtigung erst im passenden Moment anbieten, etwa nach einer Lieferanfrage: „Möchtest du über deine Lieferung informiert werden?“ Ablehnung lässt Bestellung und Konto uneingeschränkt nutzbar.
- Einstellungen: „Lieferstatus und Rückfragen“, „Abo-Erinnerungen“, „Angebote“. Betriebssystem-Erlaubnis und gewählte Themen getrennt anzeigen. Keine Werbung durch Zustimmung zu Liefermeldungen.
- Keine zusätzliche Push-Meldung für jeden Zwischenschritt oder bereits direkt in der App sichtbare Eingangsbestätigung. Versandbestätigung und wichtige Änderungen weiterhin im Kundenkonto dokumentieren und per E-Mail zustellen, sobald der E-Mail-Versand eingerichtet ist.
- Sperrbildschirmtexte ohne Name, Adresse, Warenkorbinhalt oder Zahlungsdetails. Nach Antippen Anmeldung und serverseitige Zugriffsprüfung, bevor Details erscheinen.
- Erinnerungen und Werbung tagsüber versenden; zeitkritische Lieferänderungen nur im Zusammenhang mit einer tatsächlich anstehenden Lieferung. Keine Critical Alerts.

## Technische Umsetzung nach Apple-Team-Zuordnung

APNs-Produktionsumgebung für TestFlight, Push-Capability nur in der Kunden-App. APNs-Schlüssel ausschließlich serverseitig speichern. Gerätetoken einem angemeldeten Kunden zuordnen, bei Abmeldung/Accountwechsel lösen; ungültige Tokens deaktivieren. Berechtigungen und Einwilligungsänderungen protokollieren.

Versand über eine serverseitige Ereigniswarteschlange mit eindeutiger Kombination aus Ereignis, Gerät und Kanal, damit Wiederholungen keine doppelten Meldungen erzeugen. Ereignisstatus vor Versand erneut prüfen: abgesagte/pausierte Lieferungen dürfen keine veralteten Erinnerungen auslösen. Links nur auf erlaubte eigene App-Routen. Keine Kontodaten in Push-Payloads.

Im CRM-Kommunikationsverlauf Kanal, Vorlage, Zeitpunkt und APNs-Annahmestatus dokumentieren. Eine von APNs angenommene Nachricht ist kein Nachweis, dass sie zugestellt oder gelesen wurde. Fehler bei Push dürfen weder Bestellstatus noch E-Mail-Versand zurückrollen.

Abnahme: echte Geräte, Erlaubnis/Ablehnung, Abmeldung/Accountwechsel, Doppelversand, Terminänderung, pausiertes Abo, gesperrter Bildschirm, Zugriff auf fremde Bestellung und ungültiges Token.
