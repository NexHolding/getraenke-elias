# Entscheidungen für die nächste App-Runde

Die Grundbasis wurde ohne Rückfragen umgesetzt. Diese Antworten werden erst für Signierung, Hardware und den weiteren Ausbau benötigt; keine Passwörter oder geheimen Schlüssel im Chat senden.

1. **Apple-Veröffentlichung:** Unter welchem Apple-Developer-Team/Firmennamen sollen die Apps laufen? Kunden-App öffentlich im App Store; Kassen-App nur intern/gezielt verteilt oder ebenfalls öffentlich? Zunächst TestFlight als gemeinsame Abnahmephase vorgeschlagen.
2. **App-Namen und Kennungen:** Passen „Elias Getränke“ für Kunden und „Elias Kasse“ für das iPad? Bundle-IDs sind vorläufig `de.getraenkeelias.kunden` und `de.getraenkeelias.kasse`.
3. **Geräte und Drucker:** Exaktes iPad-Modell/iPadOS, Epson-Modell, Papierbreite und gewünschter Anschluss (LAN/WLAN, Bluetooth oder USB)? Vorgabe der Basis: iOS/iPadOS 17+, HTTPS-Netzwerkdruck.
4. **Kundenzahlung:** Zunächst Lieferanfrage mit Bestätigung und späterer Abrechnung wie auf der Website, oder verbindlich bestellen und sofort online bezahlen? Falls sofort: gewünschter Zahlungsanbieter und Zahlarten (z. B. Apple Pay/Karte).
5. **Kassenbetrieb:** Kartenterminal-/TSE-Anbieter und gewünschte automatische PIN-Sperrzeit? Muss bei WLAN-Ausfall weiter kassiert werden? Aktuelle Basis bucht ausschließlich online und übernimmt die bestehende TSE-Sperre.
6. **Benachrichtigungen:** Push-Mitteilungen für Bestellbestätigung, Liefertag und Ankunft gewünscht? Welche davon zusätzlich zu E-Mail? APNs folgt nach Apple-Team-/App-ID-Festlegung.

Weiterhin fehlen aus der bisherigen Inbetriebnahme der echte Lieferant, SMTP-Zugang/Versanddomain und die eigene Domainumschaltung. Der Demo-Lieferant bleibt wie vereinbart erhalten. Ein hochauflösendes Original-Logo wäre für die endgültigen Store-Icons hilfreich; aktuell sind die vorhandenen Elias-Assets eingebunden.

Nicht als neue Entscheidung offen: Mitarbeiterrechte, Pfand-/Steuerberechnung und CRM-Daten bleiben zentral; keine zweite getrennte Artikelpflege in den Apps.
