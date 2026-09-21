# Entscheidungen für die nächste App-Runde

Aktualisiert am 21.09.2026. Festgelegt: TestFlight für beide Apps, iPad Pro für die Kasse, Epson TM-m30II, Kundenbestellung als Lieferanfrage, Zahlung später und separates SumUp-EC-Gerät ohne Anbindung. Keine Passwörter oder geheimen Schlüssel im Chat senden.

1. **Apple-Veröffentlichung:** Apple-Team Chris Neve (`LCYUVY9ZZ4`) ist zugeordnet; beide Apps sind angelegt. Kunden-App öffentlich im App Store; Kassen-App nur intern/gezielt verteilt oder ebenfalls öffentlich? TestFlight für beide Apps ist beauftragt; die Xcode-Anmeldung ist für die Signierung noch zu erneuern.
2. **App-Namen und Kennungen:** Angelegt sind „Getränke Elias“ für Kunden und „Elias Kasse“ für das iPad. Registrierte Bundle-IDs: `de.getraenkeelias.kunden` und `de.getraenkeelias.kasse`.
3. **Geräte und Drucker:** Festgelegt: iPad Pro und Epson TM-m30II. Verbunden erkannt: iPad Pro 12,9 Zoll (4. Generation), iPadOS 26.7. Noch offen: Papierbreite und Anschlussvariante des Druckers. Vorgabe der Basis: iOS/iPadOS 17+, HTTPS-Netzwerkdruck.
4. **Kundenzahlung:** Entschieden: Lieferanfrage mit Bestätigung. Onlinezahlung kommt später hinzu; dafür ist jetzt keine Anbieterentscheidung nötig.
5. **Kassenbetrieb:** Entschieden: separates SumUp-EC-Gerät ohne Integration. Noch offen: TSE-Anbieter und gewünschte automatische PIN-Sperrzeit. Muss bei WLAN-Ausfall weiter kassiert werden? Aktuelle Basis bucht ausschließlich online und übernimmt die bestehende TSE-Sperre.
6. **Benachrichtigungen:** Konzept für Lieferbestätigung, Änderungen/Rückfragen, Lieferung unterwegs und Abo-Erinnerungen ist in PUSH-KONZEPT.md dokumentiert. Werbung separat und standardmäßig aus. APNs folgt nach Apple-Team-/App-ID-Festlegung.

Weiterhin fehlen aus der bisherigen Inbetriebnahme der echte Lieferant, SMTP-Zugang/Versanddomain und die eigene Domainumschaltung. Der Demo-Lieferant bleibt wie vereinbart erhalten. Ein hochauflösendes Original-Logo wäre für die endgültigen Store-Icons hilfreich; aktuell sind die vorhandenen Elias-Assets eingebunden.

Nicht als neue Entscheidung offen: Mitarbeiterrechte, Pfand-/Steuerberechnung und CRM-Daten bleiben zentral; keine zweite getrennte Artikelpflege in den Apps.
