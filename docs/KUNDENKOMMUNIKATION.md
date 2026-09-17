# Kundenkonto und Kommunikation

## Kundenablauf

- Selbstregistrierung mit E-Mail-Adresse, Name und eigenem Passwort (mindestens 12 Zeichen, doppelte Eingabe).
- Bestätigungs-E-Mail mit Zugang zum Kundenkonto und einmaligem Bestätigungslink; kein Passwortversand.
- Persönlicher Link führt zunächst auf eine Bestätigungsseite. Erst der bewusste Klick verbraucht ihn; automatische E-Mail-Vorschauen verbrauchen den Link nicht.
- Ohne bestätigte E-Mail-Adresse kein Kundenzugriff. Bestätigung kann erneut angefordert werden.
- „Passwort vergessen?“ fordert einen einmaligen Rücksetzlink an. Nach Bestätigung wird ein neues Passwort gewählt. Die Antwort verrät nicht, ob die Adresse registriert ist.
- Einladungen aus der Kundenakte führen nach Bestätigung direkt zur Passwortwahl.

## Kommunikationshistorie

Die zweite Navigation im Kundenkonto sowie in CRM → Kunden → Kundenakte enthält „Kommunikation“. Dort stehen Empfänger, Absender, Betreff, Text, Erstellungszeit, Versandzeit, Nachrichtenart und Versandstatus. Ältere Einträge sind seitenweise abrufbar.

Neue Bestellbestätigungen, Lieferscheine und Rechnungen werden automatisch aus dem Postausgang archiviert. Der Supabase Send Email Hook erfasst Bestätigungen, Einladungen, Rücksetzlinks und unterstützte Sicherheitsnachrichten. Persönliche Sicherheitslinks/Codes werden in der Historie durch einen Hinweis ersetzt, niemals im Klartext archiviert.

PDF-Anhänge werden vor dem Versand als identische Datei gespeichert und beim Abruf mit SHA-256 geprüft. Die Anzeige erzeugt keinen neuen Beleg mit möglicherweise veränderten Einstellungen. Historische E-Mails aus der Zeit vor dieser Erweiterung tragen einen Hinweis, dass ihre ursprünglichen Anhänge nicht nachträglich verfügbar sind. E-Mails des alten Auth-Providers lassen sich nicht rückwirkend rekonstruieren.

„An Mailserver übergeben“ bedeutet SMTP-Annahme; es ist kein Nachweis einer Zustellung ins Postfach oder eines Lesens. Fehlgeschlagene und unklare Versuche werden separat angezeigt. Unklare Versuche werden nicht blind automatisch wiederholt.

## Sicherheit und Betrieb

- Migration 019 ergänzt private Archiv-, Anhang- und Auth-Versandtabellen. Direkter Zugriff durch `anon`/`authenticated` ist gesperrt.
- Kunden lesen ausschließlich die eigene Kunden-ID. CRM-Zugriff erfordert das Modul `kunden`. Der Steuerberater hat keinen Zugriff auf Kundenkommunikation.
- Systemkonten bleiben aus Kundenakten ausgeschlossen.
- Nachrichteninhalt und Anhänge können über die Anwendung nicht verändert werden; Datenbanktrigger sperren Inhaltsänderungen. Die Historie bleibt erhalten, wenn der operative Postausgang gelöscht wird.
- Der HTTP-Hook prüft Standard-Webhooks-Signaturen und Zeitstempel. `AUTH_EMAIL_HOOK_SECRET` ist nur serverseitig hinterlegt.
- Der Hook bestätigt schnell eine dauerhaft gespeicherte Versandaufgabe. Sicherheitslinks werden für den Versand mit dem bestehenden AES-256-GCM-Schlüssel verschlüsselt und nur in der privaten Warteschlange aufbewahrt; nach Versand oder terminalem Fehler werden sie entfernt. Nicht versandte Links laufen nach 55 Minuten ab. Der Cron-Worker bereinigt abgelaufene Aufgaben.
- Der unmittelbare Worker läuft über Next.js `after`; der bestehende Fünf-Minuten-Cron verarbeitet liegen gebliebene Aufgaben. Atomare Claims vermeiden parallelen Doppelversand. Unterbrochene Versuche werden als unklar markiert.
- SMTP-Einstellungen unter Einstellungen → Schnittstellen gelten auch für Auth-E-Mails. Ohne aktivierten SMTP-Zugang werden neue Auth-Mail-Anforderungen mit einem Fehler beantwortet, niemals als versendet ausgegeben.

## Einrichtung

1. SMTP-Host, Benutzer, Port 587/465, Absender und Passwort im CRM eintragen, speichern, Verbindung prüfen und automatischen Versand aktivieren.
2. Supabase: E-Mail-Bestätigung aktiviert; Send Email Hook auf `https://getraenke-elias.vercel.app/api/hooks/auth-email`, Signaturschlüssel identisch zur geschützten Vercel-Variable.
3. Redirects für `/auth/callback` und `/auth/callback?next=/passwort` auf freigegebenen Elias-Domains hinterlegen.
4. Mit einer berechtigten echten Testadresse Registrierung und Rücksetzung bis zum Posteingang prüfen. SMTP-Verbindungsprüfung allein weist keine Postfachzustellung nach.

Beim Einbau war noch kein SMTP-Zugang hinterlegt. Es wurde daher keine externe E-Mail verschickt; tatsächliche Postfachzustellung kann erst nach Einrichtung geprüft werden.

## Prüfung und Quellen

`npm test`, `npm run test:db`, `node scripts/validate-communications.mjs`, `node scripts/verify-communications-browser.mjs`, ESLint und Produktionsbuild. Der Browser-Test verwendet kurzlebige Testkonten und löscht diese wieder; Links werden über die Admin-Testfunktion erzeugt, ohne E-Mails zu versenden. Er prüft echte Supabase-Bestätigung, Passwortwechsel, abgelaufene/verbrauchte Links, Originalanhang, Kunden-/CRM-Ansicht sowie verweigerten Fremd-, anonymen und Steuerberaterzugriff.

- [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Supabase Passwort-Authentifizierung und Wiederherstellung](https://supabase.com/docs/guides/auth/passwords)
- [Supabase SMTP-Einrichtung](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Hook-Konfiguration](https://supabase.com/docs/guides/local-development/cli/config)
