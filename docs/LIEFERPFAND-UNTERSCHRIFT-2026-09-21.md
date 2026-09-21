# Pfandrücknahme und unterschriebene Auslieferung

## Änderungen
- Jeder Lieferschein erlaubt Bar- oder EC-Zahlung, auch wenn Rechnung freigegeben wurde. Rechnung bleibt ausschließlich bei entsprechender Auftragsfreigabe auswählbar. Die Kundenvorgabe wird dadurch nicht geändert.
- Jede abgeschlossene Lieferung benötigt Namen und Unterschrift. Eine Abstellgenehmigung ersetzt die Unterschrift nicht mehr. Historische Lieferscheine bleiben unverändert.
- „Pfand erfassen“ öffnet die gemeinsame Pfandkachel-Komponente der Kasse. Speichern sichert die Pfandmengen im Lieferschein-Entwurf. Erneutes Öffnen stellt sie wieder her.
- Mengen-, Zahlungsart- und Pfandänderungen setzen Unterschrift und Zahlungsbestätigung zurück. Ein unsicher beantworteter Abschluss wird mit derselben Kennung erneut geprüft.
- Pfand wird als negative Pfandposition mit derselben Cent- und Steuerlogik wie in der Kasse geführt. Lieferwaren bleiben separate Bestandspositionen; zurückgenommenes Leergut erhöht keinen Verkaufsartikelbestand.
- Rechnungsbetrag, Lieferübersicht, Tagesliste, Lieferschein, Rechnung und Finanzbericht berücksichtigen den Abzug. Bereits archivierte Dokumente werden nicht überschrieben.
- Überschüssiges Pfand wird als Auszahlung angezeigt; zum Abschluss Bar/EC-Auszahlung ausdrücklich bestätigen. Negative Zahlungsbuchungen sind nur für dokumentierte Lieferabrechnungen zugelassen. Bei 0 € gilt die Rechnung als verrechnet, ohne künstliche Zahlungsbuchung oder Mahnung.

## Technische Umsetzung und Prüfung
Migration 030 ergänzt am Lieferschein Pfandpositionen, gespeicherten Endbetrag und Zahlungsart. Die bestehenden Buchungsfunktionen sichern Unterschrift und Zahlungsbestätigung serverseitig ab. Doppelte Pfandarten, unbekannte Werte und ungültige Mengen werden abgelehnt. Entwürfe werden mit Versionsprüfung gespeichert; abgeschlossene Belege bleiben unveränderbar.

Prüfungen: sämtliche bestehenden Datenbanktests plus neue Fälle für alle Zahlungsarten, Abstellgenehmigung ohne Unterschrift, Rechnungsfreigabe, Entwurf/Wiederaufnahme, Versionskonflikte, veraltete Clients, gemischte Steuersätze, Überpfand, Nullbetrag, genau eine Zahlung/Rechnung/Bestandsbuchung bei Wiederholung. Browserprüfung mit tatsächlichen Komponenten und isolierten Daten inklusive Zeichnen der Unterschrift, Pfanddialog, gespeicherten 4,05 € Pfand und 20,73 € Zahlbetrag. PDFs wurden gerendert und visuell geprüft.

Keine echten Kundenbestellungen, Zahlungen oder E-Mails für Tests erzeugt. Die vorhandene Echtbetrieb-/TSE-Sperre bleibt bestehen. Der Web-Arbeitsbereich der iOS-App erhält die Änderung beim erneuten Öffnen; kein neues natives Binary erforderlich.
