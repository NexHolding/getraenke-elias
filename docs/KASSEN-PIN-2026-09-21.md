# Kassenentsperrung per Mitarbeiterauswahl

Beim Sperren wird ein bereits mit Passwort angemeldetes Kassengerät automatisch für 30 Tage als Terminal freigegeben. Die Passwortsitzung wird lokal beendet und eine vorhandene PIN-Sitzung serverseitig widerrufen. Die gesperrte Kasse zeigt große Namenskacheln, anschließend eine maskierte vierstellige PIN mit Touch-Ziffernblock. Erfolgreiches Entsperren öffnet unmittelbar `/crm/kasse` mit den Rechten des ausgewählten Mitarbeiters.

Nur aktive Mitarbeiter mit Kassenrecht sowie aktive Inhaber erscheinen. Finanz-Lesezugänge bleiben ausgeschlossen. Konten ohne PIN sind sichtbar, erhalten aber ausschließlich den Hinweis zur PIN-Einrichtung unter Einstellungen → Mitarbeiter. Der bestehende Systemzugang erscheint ausschließlich auf diesem freigegebenen Terminal als „Administration“; die Filter in Kunden- und Mitarbeiterverzeichnissen bleiben bestehen. Die ausdrücklich gewünschte Test-PIN wurde separat als gesalzener scrypt-Hash in Supabase gesetzt. PIN und Hash werden nicht in API-Antworten ausgegeben.

Die Mitarbeiterauswahl ist nicht öffentlich: Ohne gültiges HttpOnly-Gerätecookie gibt die API keine Namen aus. PIN-Sitzungen gelten acht Stunden und sind an das Gerät gebunden. Der vorhandene serverseitige Versuchszähler begrenzt Fehlversuche; erfolgreiche Entsperrungen setzen ihn zurück. Kassenrecht und Aktivstatus werden beim Entsperren erneut geprüft. Passwortanmeldung bleibt als Wiederherstellung möglich und entfernt nach erfolgreicher Mitarbeiterprüfung veraltete Terminalcookies.

Gilt gleichermaßen für den Browser und die vorhandene iPad-App, deren Startpfad `/kassenzugang` bereits dieselbe produktive Weboberfläche lädt. Kein neuer nativer Build und keine Datenbankmigration erforderlich.

## Prüfung

- 44 Unit-Tests, ESLint und TypeScript.
- `node scripts/verify-terminal-api.mjs`: keine Namensausgabe an unregistrierte Geräte, erstmaliges Sperren, fehlende/entzogene Rechte, falsche PIN, Versuchslimit, Sitzungstausch, Sperren und Passwortwiederherstellung mit isolierten Adaptern.
- `node scripts/verify-terminal-browser.mjs`: echte Komponente mit isolierter API, vier Ansichten (1194×834, 1024×768, 834×1194, 390×844), Namensauswahl, PIN-Maskierung, Löschen, Rücktaste, Mitarbeiterwechsel, PIN-Fehler, Konten ohne PIN, Weiterleitung zur Kasse. Entsperrbutton in allen Ansichten sichtbar, keine JavaScript-Fehler.
- Grafische Nachweise liegen lokal unter `output/terminal/` und enthalten keine Produktiv-PINs im Klartext.
