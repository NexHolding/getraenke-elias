# Lieferadresse aus Registrierung und Erstbestellung

## Ursache und Änderung

Die bisherige Registrierung übergab nur den Namen an Supabase Auth. Beim anschließenden Erstellen der Kundenakte wurden ebenfalls nur Name und E-Mail gespeichert. Eine eigene Adresse im Bestellformular wurde zwar in der Bestellung gespeichert, aber nicht in ein noch leeres, angemeldetes Kundenprofil übernommen. Zudem behielt die Kontoansicht ihre beim Öffnen geladenen Kundendaten beim Wechsel zu Lieferabos bei.

Die Registrierung erfasst nun Name, Telefonnummer, Straße, Hausnummer, Postleitzahl und Ort. Die validierten Kontaktdaten werden als Registrierungsdaten gespeichert und bei der Kundenanlage in die strukturierten Kundenfelder übernommen. Das funktioniert mit der aktuellen sofortigen Anmeldung und nach einer später wieder aktivierten E-Mail-Bestätigung. Supabase-Auth-Einstellungen bleiben unverändert.

Beim Zugriff auf ein bereits verknüpftes Profil werden fehlende Daten aus dessen eigenen Registrierungsdaten ergänzt. Eindeutig lesbare ältere Adressen im einzeiligen Feld werden in die strukturierten Felder übernommen. Bei einer angemeldeten ersten Bestellung ergänzt die angegebene Lieferadresse ein leeres Kundenprofil. Vorhandene oder teilweise befüllte Adressen werden dabei nicht durch eine andere Lieferadresse ersetzt oder mit ihr vermischt. Ein Vergleich der zuvor gelesenen Werte verhindert das Überschreiben gleichzeitiger Profiländerungen.

Beim Öffnen von Profil oder Lieferabos wird der aktuelle Datensatz neu geladen. Im Abo-Bereich sind die verwendete Lieferadresse und Telefonnummer sichtbar; ein Button führt zur Profilbearbeitung. Fehlt nur die Telefonnummer, wird ausschließlich diese als fehlend genannt.

## Schutz bestehender Daten

Die Kontozuordnung bleibt ausschließlich an die verknüpfte Auth-Benutzerkennung gebunden. Keine Übernahme fremder Kundenakten oder Bestellungen anhand einer E-Mail-Adresse. Bestehende Adressen, Zahlungsfreigaben, Bestellungen, Lieferscheine und Rechnungen werden nicht überschrieben. Künftige Abo-Aufträge verwenden weiterhin das jeweils aktuelle Kundenprofil; vorhandene Aufträge behalten ihre gespeicherte Lieferadresse.

Die lesende Produktionsprüfung zeigte vollständige Adressfelder beim verknüpften Kunden mit Bestellung. Eine weitere leere verknüpfte Akte enthielt weder gespeicherte Registrierungsadressen noch Bestellungen als Datenquelle. Es werden keine fehlenden Adressen geraten. Für diese Korrektur ist keine Datenbankmigration notwendig.

## Prüfung

- Unit-Tests für Pflichtfelder, führende Nullen, ungültige Metadaten, geschützte Profilwerte und keine Mischung verschiedener Adressen.
- Isolierte PostgreSQL-Prüfung: Registrierung → Kundenprofil → tatsächliche Lieferabo-Funktion; Profiländerung, nachträgliche Ergänzung, Checkout-Übernahme, konkurrierende Änderungen und Benutzertrennung.
- Isolierter Browsertest für Registrierung, Abo ohne erneute Adresseingabe, Profilbearbeitung und Aktualisierung einer bereits geöffneten Kontoansicht; iPhone- und iPad-Format.
- ESLint und Produktionsbuild.

Native Kunden-App: Die Konto- und Abo-Ansicht verwendet den veröffentlichten Web-Arbeitsbereich. Dafür ist kein neuer nativer Build nötig; die Ansicht muss neu geladen werden.
