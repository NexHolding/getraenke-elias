# Inventur und Bestandskorrekturen

## Bedienung

Im CRM steht **Inventur** als eigener Navigationspunkt zur Verfügung, auch auf dem Tablet. Mitarbeiter benötigen das Recht „Inventur“. Für eigenständige Bruch-/Verlustbuchungen ist zusätzlich „Bruch / Bestandskorrektur buchen“ nötig. Inhaber verfügen über beide Rechte. Kunden haben weder Zugriff auf diese Funktionen noch auf Einkaufswerte und Lagerbestände.

1. Inventur mit Bezeichnung, aktuellem Zählbeginn und Lagerort starten. Die Zählliste enthält alle aktiven Artikel sowie archivierte Artikel mit Restbestand. Es kann genau eine offene Inventur geben.
2. Sortiment oder Suchbegriff auswählen. Volle Gebinde und zusätzliche lose Flaschen/Dosen/Stück zählen; auch Nullbestände ausdrücklich mit 0 erfassen. „Speichern & weiter“ führt zur nächsten Position. Speichern verändert noch keinen Warenbestand.
3. Bei Differenzen einen Grund auswählen, bei „Sonstiger Grund“ eine Erklärung eingeben. Einkaufswerte können beim Zählen offen bleiben. Der Inhaber muss vor der Übernahme die Netto-Einkaufswerte für positive Mengen ergänzen; ohne Pfand, je vollem Gebinde. Bestände mit Menge 0 haben Warenwert 0. Kostenlose Ware darf mit 0 bewertet werden; die Begründung gehört in die Notiz.
4. Zusätzliche bestehende oder neue Artikel ergänzen. Neue Artikel erhalten automatisch eine Artikelnummer und stehen in „Artikel & Lager“ unter den archivierten/inaktiven Artikeln bereit. Sie sind intern vorhanden, aber bis zur Prüfung von Verkaufspreis, Pfand, Gebinde und Freigabe nicht im Kundensortiment sichtbar.
5. Vollständig gezählte Inventur zur Prüfung vorlegen. Mitarbeiter können den Bestand nicht übernehmen. Der Inhaber prüft Mengen, Differenzen und Werte, öffnet die Zählung bei Bedarf erneut und bestätigt ausdrücklich per Kontrollkästchen die Übernahme als neuen Warenbestand.
6. Nach der Übernahme sind Zählung und Freigabe gesperrt. Inventurbericht als PDF und Artikelliste als CSV sind jederzeit abrufbar. Laufende Inventuren liefern gekennzeichnete Entwürfe. Bei einem Fehler folgt eine neue Inventur oder eine begründete Bestandskorrektur; abgeschlossene Inventuren werden nicht überschrieben.

## Laufender Betrieb und Mengen

`products.stock` bleibt die Zahl verkaufsfähiger vollständiger Gebinde. `loose_stock` enthält den Rest in Einzelstücken, immer kleiner als die Gebindegröße. Beispiel: Zehn 6er-Gebinde, eine Flasche Bruch → neun volle Gebinde und fünf lose Flaschen. Kasse und Lieferservice verkaufen weiterhin die angelegten Artikelgebinde; die Inventur erweitert den Verkauf nicht automatisch um Einzelartikel.

Jede Zählposition speichert den damaligen Buchbestand, Zählbestand, Gebindegröße, Einkaufswert, Mitarbeiter und Zeitpunkt. Bei bekannten Beständen gilt bei der Übernahme:

**Neuer Bestand = gezählter Bestand + aktueller Buchbestand − Buchbestand bei der Zählung.**

So bleiben Verkäufe, Lieferungen, Wareneingänge und Korrekturen nach der jeweiligen Zählung erhalten. Der Bericht zeigt die spätere Bewegung und den übernommenen Bestand getrennt vom Zählbestand. Ist der Ausgangsbestand unbekannt, muss nach zwischenzeitlicher Bewegung erneut gezählt werden. Bereits beim Speichern prüft eine Bestandsversion, ob die Buchmenge seit Anzeige verändert wurde. Gleichzeitige Änderungen einer Zählposition werden ebenfalls abgewiesen. Fehler bei der Übernahme rollen die gesamte Transaktion zurück.

Artikel, die während der Inventur neu aktiv werden oder Bestand erhalten, müssen vor Abschluss ergänzt werden. Änderungen der Gebindegröße werden bei positivem Bestand oder laufender Inventur gesperrt. Die normale Artikelpflege kann Bestände nicht direkt ändern. Ein Zurücksetzen der Einrichtungsvorgänge wird während offener Inventur blockiert; nach Abschluss werden nur Demo-Bewegungen nach der letzten physischen Zählung zurückgenommen. Inventur- und Korrekturbelege bleiben erhalten.

## Bruch, Verlust und Entnahmen

Unter „Bruch & Bestandskorrekturen“ werden einzelne Einheiten oder ganze Gebinde direkt gebucht. Gründe: Bruch/Beschädigung, Diebstahl/Verdacht, Verlust/Schwund, Ablauf/Verderb, verschenkte Ware, Privatentnahme, Verkostung/Warenprobe, Lieferantenrückgabe, Wiedergefunden/Mehrbestand, Zähl-/Erfassungsfehler und sonstiger Grund. Ereignisdatum, Erläuterung und optional eine externe Belegreferenz werden gespeichert. Eine Reduzierung unter null ist ausgeschlossen. Bei bisher unbekanntem Bestand muss zuerst inventarisiert werden.

Zugänge durch Fund oder Korrektur und Gegenbuchungen sind dem Inhaber vorbehalten. Falsche Korrekturen werden mit Begründung gegenläufig gebucht; Original und Gegenbuchung bleiben verbunden erhalten. Ein Beleg kann nur einmal gegengebucht werden. Wiederholte identische Übermittlungen mit derselben Vorgangs-ID buchen keine zweite Bewegung.

PDF-Belege zeigen Artikel, Verpackung, Menge vorher, Veränderung, Menge danach, Grund, Notiz, Ereignis-/Buchungsdatum, Bearbeiter und den bekannten Netto-Warenwert. Geschenke, Privatentnahmen und Proben benötigen gegebenenfalls weitere Angaben bzw. Umsatzsteuerbehandlung in der Buchhaltung. Das Modul dokumentiert den Warenbestand und erstellt hierfür keine automatische Umsatzsteuerbuchung oder Meldung an das Finanzamt.

## Bericht und rechtliche Einordnung

Die Berichte orientieren sich an der mengen- und wertmäßigen Erfassung von Waren nach [§ 240 HGB](https://www.gesetze-im-internet.de/hgb/__240.html), der Bewertung nach [§ 253 HGB](https://www.gesetze-im-internet.de/hgb/__253.html) und den Aufbewahrungsregeln nach [§ 257 HGB](https://www.gesetze-im-internet.de/hgb/__257.html). Es handelt sich um **Wareninventurberichte**, nicht um ein vollständiges Inventar einschließlich aller Vermögensgegenstände und Schulden. Pfand gehört nicht zum ermittelten Netto-Warenwert. Der tatsächlich anzusetzende Einkaufswert, mögliche Abschreibungen und deren Nachweise müssen mit der Buchhaltung abgestimmt werden.

Das Deckblatt nennt den Zählbeginn, jede Position ihren tatsächlichen Zählzeitpunkt. Mehrtägige Zählungen werden nicht als einheitlicher fiktiver Stichtagsbestand ausgegeben. Für einen abweichenden Abschlussstichtag ist eine gesonderte Fortschreibung bzw. Rückrechnung erforderlich. Rückdatierte physische Zählungen sind nicht vorgesehen.

Inventare sind grundsätzlich zehn Jahre aufzubewahren; für Buchungsbelege gelten grundsätzlich acht Jahre, gegebenenfalls länger bei fortbestehender steuerlicher Relevanz. Das System löscht Inventur-/Korrekturbelege nicht automatisch. Wiederherstellbare Datenbanksicherungen, geordnete Exporte, Berechtigungsverwaltung und betriebliche Verfahrensdokumentation sind weiterhin erforderlich. Die [GoBD-Anpassung des BMF vom 14.07.2025](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.html) gehört zum rechtlichen Kontext. Eine Anwendung allein stellt keine behördliche Zertifizierung oder vollständige GoBD-Organisationsprüfung dar.

## Technische Sicherungen und Prüfung

Migration `202609170012_inventory.sql` ergänzt Tabellen `inventory_runs`, `inventory_lines`, `inventory_events`, `stock_adjustments`, Bestandsspalten und Verknüpfungen der Lagerbewegungen. RLS ist aktiv, die Transaktionsfunktion ist ausschließlich für `service_role` aufrufbar; die API prüft aktive Mitarbeiter und Modulrechte. Der RPC validiert die Rechte zusätzlich. Mengenänderungen werden atomar mit demselben Transaktions-Lock wie Kasse und Auslieferung gebucht. Abschlüsse, Ereignisprotokolle und Korrekturbelege werden durch Datenbanktrigger vor Überschreiben/Löschen geschützt. Systemadministratoren erscheinen in Belegen neutral als „Administration“.

Prüfung: `npm test`, `npm run test:db`, `npm run lint`, `npm run build`; Browserablauf `scripts/inventory-browser-check.mjs` gegen `scripts/local-fixture-server.mjs` mit ausschließlich isolierten Daten. Geprüft werden insbesondere Erst- und Folgeinventur, fehlende Werte/Positionen, Mitarbeitersperren, explizite Eigentümerbestätigung, laufende Verkäufe, einzelne Flaschen, Gegenbuchungen, Wiederholungsanfragen, veraltete Schreibvorgänge, Produktanlage, PDF/CSV und Kundentrennung.

Die Tabletbedienung läuft jetzt im vorhandenen browserbasierten CRM. Native iPad-Pakete bleiben die vorgesehene App-Folgephase und können dieselben geschützten Endpunkte verwenden. Für die Inventur wird kein separates Kundenmodul bereitgestellt.
