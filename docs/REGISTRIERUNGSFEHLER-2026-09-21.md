# Registrierung: fehlender Bestätigungsversand

Live reproduziert mit freigegebener Testadresse: Supabase `auth.signUp` antwortet HTTP 500 mit `Service currently unavailable due to hook`. Kein Konto und keine Sitzung entstanden. Der Elias Send-Email-Hook verlangt aktivierten und vollständig eingerichteten SMTP-Ausgang, während SMTP deaktiviert ist und Host, Benutzer sowie Absender fehlen. E-Mail-Anmeldung ist aktiv, Signup nicht deaktiviert, Bestätigung verpflichtend.

Die Kundenoberfläche nennt bei diesem Fehler jetzt die nicht verfügbare E-Mail-Bestätigung mit Kontaktmöglichkeit. Provider-Rohmeldungen und Kontodetails werden nicht ausgegeben. Ratenbegrenzung und Passwortvalidierung haben eigene Hinweise. Bei einer tatsächlich gelieferten Sitzung wird das Kundenkonto geladen, statt fälschlich eine Bestätigungsmail anzukündigen. Der Hook protokolliert Konfigurationsfehler ohne E-Mail-Adresse, Passwort oder Token.

Die Bestätigung wurde nicht stillschweigend deaktiviert: `signedCustomer()` ordnet bislang bestehende Kundendaten nach bestätigter E-Mail zu. Supabase-Autoconfirm würde diese Sicherheitsannahme ändern. Die Entscheidung zur vorübergehenden Registrierung ohne Bestätigung wurde angefragt; alternativ ist ein tatsächlicher Versanddienst einzurichten. Der Supabase-Standardversand ist auf Projektteam-Adressen beschränkt (https://supabase.com/docs/guides/auth/auth-smtp) und ersetzt keinen öffentlichen Kundenversand.

Prüfung: tatsächlicher fehlgeschlagener Live-Signup ohne dauerhaft angelegtes Konto; Konfigurationskontrolle; 54 Unit-Tests; Lint; Produktionsbuild.
