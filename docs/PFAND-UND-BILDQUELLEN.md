# Artikel, Verpackung und Bildquellen

Der Import trennt 28 Sammelpositionen des Flyers in Einzel-SKUs. Insgesamt 149 aktive Artikel. Historische Sammelpositionen bleiben in der Datenbank inaktiv, im Lager standardmäßig ausgeblendet; mit „Archiv anzeigen“ zugänglich.

Pfand wird in ganzen Cent je Gebinde gespeichert. Die Artikelpflege berechnet bei Auswahl eines Profils Flaschenzahl × Flaschenpfand plus Kastenpfand. Individuelle Werte und pfandfreie Artikel sind möglich. Alle Berechnungen laufen nochmals serverseitig. Pfand wird nicht rabattiert.

Beispiele: Alwa 6 × 1 l 2,40 €, Wasser 12er-Kasten 3,30 €, 20er Bier 3,10 €, 24er Bier/Longneck 3,42 €, 24er Einwegdose 6,00 €. Getränke mit 15-Cent-Flaschen sind nicht mit 8-Cent-Longneck gleichzusetzen. Fritz und Paulaner Spezi sind entsprechend als Longneck hinterlegt.

Recherchequellen:
- https://www.alwa-mineralwasser.de/limonaden/cola-mix.html (6 × 1 l PET-Mehrweg)
- https://www.alwa-mineralwasser.de/wissen/faq/pfand.html
- https://www.coca-cola.com/de/de/impact/ausgetrunken-und-dann-fakten-zu-den-coca-cola-getraenkeflaschen (15-Cent-Mehrweg / 25-Cent-Einweg)
- https://www.getraenke-rethmeier.de/wp-content/uploads/2026/01/Online-Preisliste-F3-zzgl.-Mwst.pdf (Fritz 24 × 0,33 l 3,42 €)
- https://www.gbz-net.de/hersteller/paulaner (Spezi 24 × 0,33 l 3,42 €)
- https://www.kelemidis.de/de/shop/katalog/orangina-15x025l_308050/ (15 × 0,25 l 3,75 €)

Die Original-Lieferliste unterscheidet bei manchen Cola-Positionen die Verpackung nicht ausdrücklich. Die importierten Profile dokumentieren diese Annahme in `data_note`, damit die konkrete Verpackung am Wareneingang abgeglichen werden kann. Wein/Sekt sind entsprechend der Auftraggebervorgabe pfandfrei vorbelegt; besondere Mehrweg-Weinartikel benötigen ein individuelles Pfandprofil.

## Produktbilder – Überarbeitung vom 17.09.2026

134 der 143 aktiven Getränkeartikel haben jetzt recherchierte Originalabbildungen (zuvor 42). 92 Artikel wurden ergänzt, sechs vorhandene Zuordnungen verbessert. Die sechs weiteren aktiven Positionen sind Vermietung bzw. Kommissionsgebühr.

Alle 98 ergänzten/ersetzten Dateien wurden heruntergeladen, auf gültiges Bildformat geprüft und visuell kontrolliert. Die Quellen mit Artikelzuordnung, Originaladresse und SHA-256-Prüfsumme stehen in `data/image-sources.json`. Herstellerdownloads werden bevorzugt; ergänzend wurden öffentliche Fachhändlerkataloge verwendet. Lokal gespeicherte Bilder werden durch Next.js in passenden Auflösungen ausgeliefert. Eigene CRM-Uploads bleiben erhalten.

Besondere Darstellungen sind unmittelbar am Bild gekennzeichnet:
- 14 Beil-Artikel: echte Herstelleretiketten, keine erfundenen Flaschenmontagen. Ein Etikett ist keine verbindliche Gebindeabbildung.
- Fünf Sammel-/unspezifische Positionen (Teinacher 1 l, Gerolsteiner, Teinacher Genuss-Limonade, Schweppes, Fritz): „Sortenbeispiel“. Keine neue Sorte oder Gebindegröße wird durch das Foto angelegt.
- Hirschquelle 0,75 l: Herstellerabbildung der beiden Glasflaschenformen, gekennzeichnet als „Flaschenabbildung“; kein abweichender 12er-Kasten für den hinterlegten 9er-Kasten.

### Verbleibende neun Getränke ohne eindeutig passende Abbildung

| Artikel | Grund |
| --- | --- |
| St. Leonhard Still / Medium | Hinterlegt sind 0,75 l; gefundene aktuelle Originalabbildungen zeigen 1 l. |
| Ensinger Sport Grape | Hinterlegt sind 0,7 l; aktuelle Herstellerabbildung zeigt 0,75 l. |
| Distelhäuser Alkoholfrei 0,5 l | Aktuelle passende Pils-Abbildung nur in 0,33 l gefunden; die neue 0,0%-Helles-Variante ist ein anderer Artikel. |
| Beck’s Pils verschiedene Sorten 0,5 l | Keine eindeutige Sorte; verfügbare geprüfte Abbildungen der Sammelauswahl zeigen 0,33 l. |
| Beil Schwäbischer Most | Keine eindeutig zuordenbare aktuelle Originalabbildung gefunden. |
| Sekt Brillant trocken | Marke fehlt; sowohl Söhnlein als auch Schloss Affaltrach führen „Brillant“. |
| Sekt Rosé / Piccolo | Hersteller/Marke fehlen in der Lieferliste. |

Die fehlenden Bilder können nach genauer Produktidentifikation oder mit eigenen Fotos ergänzt werden. Es werden keine Markenverpackungen generiert und keine Produkt-, Preis-, Pfand- oder Bestandsdaten aufgrund von Bildrecherche verändert.

Migration 014 aktualisiert ausschließlich `image_url` und `image_source`. Sie gleicht Artikelname, Flaschenzahl, Volumen und bisherigen Bildpfad ab; zwischenzeitlich bearbeitete Artikel oder eigene Bilder werden nicht überschrieben. Vor Veröffentlichung stehen die Bilddateien bereit, anschließend werden die Datenbankzuordnungen angewendet.
