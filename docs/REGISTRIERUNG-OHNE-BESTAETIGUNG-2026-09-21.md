# Vorübergehende Registrierung ohne Bestätigung

Auf ausdrücklichen Wunsch wird in Supabase Auth ausschließlich `auth.email.enable_confirmations = false` gesetzt. Der bestehende Send-Email-Hook bleibt für spätere Passwort-/Zugangsmails konfiguriert. Öffentliche Registrierung benötigt dadurch keinen Mailversand, und Supabase liefert direkt eine Sitzung. Die Website lädt anschließend das Kundenkonto.

Wichtig: Supabase setzt bei dieser Betriebsart `email_confirmed_at` automatisch. Dieses Feld beweist dann keinen Zugriff auf das E-Mail-Postfach. Die Kundenbereitstellung vertraut deshalb ausschließlich einer bestehenden Verknüpfung über `customers.user_id`. Sie verknüpft keine Altakte anhand einer E-Mail-Adresse. Ein neuer Zugang mit bereits vorhandener, anderweitig oder noch nicht verknüpfter Kundenadresse erhält einen verständlichen Hinweis zur erforderlichen Prüfung. Bereits verknüpfte Zugänge bleiben benutzbar. Gleichzeitige erste Abrufe erstellen dank eindeutiger Datenbankindizes genau eine Kundenakte.

Migration 028 verhindert außerdem, dass ein neuer Online-Kunde verwaiste Nachrichten allein durch eine identische Empfängeradresse übernimmt. Explizit über die Auth-Nutzer-ID zugeordnete Nachrichten werden weiter korrekt verknüpft. Bestehende Kunden, Belege und Nachrichten werden nicht verändert.

Die Datenschutzhinweise beschreiben den vorübergehenden Ablauf. Passwort-Rücksetz- und Zugangsmails benötigen weiterhin einen eingerichteten Versanddienst; bestehende Passwörter werden nicht ausgegeben oder geändert.

Validierung: 54 Unit-Tests, vollständige Datenbanktests einschließlich `scripts/validate-customer-provision.mjs`, Lint und Produktionsbuild. Der neue Test nutzt echte SQL-Migrationen und prüft neue/parallel angelegte Kunden, blockierte Übernahme vorhandener Akten, korrekte explizite Verknüpfungen, getrennte Nachrichtenarchive und verweigerten anonymen Datenzugriff.

Wiederherstellung: Zuerst den E-Mail-Versand vollständig einrichten und bis zum Posteingang testen. Anschließend Supabase `auth.email.enable_confirmations = true` setzen und die temporäre Beschreibung im Datenschutz aktualisieren. Bereits während der Übergangszeit automatisch bestätigte Konten gelten dadurch nicht rückwirkend als per E-Mail verifiziert. Die strikte Zuordnung über die Nutzer-ID bleibt bestehen.

Live-Abnahme: Supabase bestätigt `email_confirmation_required: false`; die CLI hat ausschließlich diese eine Eigenschaft geändert. Registrierung über das öffentliche Formular mit der freigegebenen Testadresse lieferte sofort eine Sitzung und genau eine neue Kundenakte. Abmelden und erneute Passwort-Anmeldung wurden erfolgreich geprüft. Eine absichtlich nicht verknüpfte Test-Altakte blieb trotz gleicher E-Mail geschützt. Keine Bestätigungsmail wurde erzeugt. Alle temporären Auth-/Kundendatensätze wurden entfernt. Nach dem Abmelden werden Anmeldereiter, Profilzustand und Erfolgsmeldung zurückgesetzt.
