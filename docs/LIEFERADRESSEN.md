# Getrennte Lieferadressfelder

Kundenanlage im CRM, Kundenkonto und Bestellformular erfassen unter „Lieferadresse“ vier Pflichtfelder: Straße, Hausnummer, Postleitzahl und Ort. Die Angaben werden separat in `customers` und `orders` gespeichert. Postleitzahlen sind fünfstellige Zeichenketten, damit führende Nullen erhalten bleiben; Hausnummern erlauben Zusätze wie `12 a` oder `12-14`.

Die vollständige Darstellung `Straße Hausnummer, PLZ Ort` wird serverseitig abgeleitet und weiterhin für Navigation, Lieferscheine und Rechnungen verwendet. Bestellungen erhalten eine eigene Adresskopie; spätere Profiländerungen überschreiben keine historischen Auftragsadressen. Lieferabos übernehmen die strukturierten Felder aus dem Kundenstamm.

Bestehende Freitextadressen werden bei der Migration nicht verändert. Eindeutige Altadressen werden im Formular vorbefüllt; nicht eindeutig zerlegbare Adressen erscheinen als Hinweis zur manuellen Zuordnung. Mit dem Speichern werden die vier Felder dauerhaft hinterlegt. Bei einer Adressänderung werden bisherige Geokoordinaten ungültig und müssen neu abgeglichen werden.

Migration: `202609170013_delivery_address.sql`. Prüfung: 18 Fachtests, Datenbanktests einschließlich Abo-Snapshot und Geocode-Rücksetzung, Lint, Produktionsbuild sowie isolierter Browserablauf `scripts/address-browser-check.mjs` für CRM, Kundenkonto und mobile Gastbestellung.
