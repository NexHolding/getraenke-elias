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

42 Artikel haben recherchierte Herstellerabbildungen. Pro Datei sind Ursprungsseite und Bildadresse in `data/image-sources.json` dokumentiert. Weitere Bilder lassen sich im CRM als JPG, PNG oder WebP (max. 5 MB) hochladen. Keine generierten Markenprodukte. Hersteller-Sortenabbildungen sind nicht automatisch Fotos jedes verkauften Kastens; das tatsächliche Gebinde steht separat am Artikel.
