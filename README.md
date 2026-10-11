# Datastory: Bienen in der Schweiz

**Datenfrage:** Wie hat sich der Bienenbestand (Anzahl Bienenvölker) in der
Schweiz von 1994 bis 2024 entwickelt, und hatte die Niederschlagsmenge der
jeweiligen Jahre einen Einfluss auf diesen Bestand?

**Untersuchungseinheit:** ein Erfassungsjahr in der Schweiz mit dem
Bienenbestand, seiner jährlichen Veränderung und der gemessenen
Niederschlagsmenge (mm).

## Datenfluss

```text
etl/data/*.csv -> extract.php -> transform.php -> load.php -> MySQL (bienenjahre)
               -> unload.php (JSON) -> script.js / Chart.js -> index.html
```

| Datei | Rolle | Team |
| --- | --- | --- |
| `etl/data/bienen_schweiz.csv` | Rohdaten FAOSTAT, Bienenvölker 1994–2024 | Backend |
| `etl/data/jahresniederschlag.csv` | Rohdaten MeteoSchweiz/BFS, 13 Stationen, 1931–2024 | Backend |
| `etl/extract.php` | liest beide CSV mit `fgetcsv` | Backend |
| `etl/transform.php` | Mittelwert Niederschlag, Veränderung, Phase | Backend |
| `etl/schema.sql` | Tabelle `bienenjahre` – einmal in phpMyAdmin ausführen | Backend |
| `etl/load.php` | schreibt die 31 Jahre in die Datenbank | Backend |
| `unload.php` | JSON-Endpunkt mit Filtern `?year=` und `?phase=` | Backend |
| `data/bienenjahre.json` | Musterdaten und Fallback, exakt im Datenvertrag | beide |
| `index.html`, `script.js`, `style.css` | Story und Chart.js | Frontend |

## Datenvertrag

Ein Datensatz = ein Jahr:

```json
{
  "jahr": 1995,
  "bienenvoelker": 269180,
  "veraenderung_abs": -758,
  "veraenderung_prozent": -0.28,
  "phase": "Rückgang",
  "niederschlag_mm": 1331.8
}
```

| Feld | Typ | Bedeutung | Darf fehlen? |
| --- | --- | --- | --- |
| `jahr` | Number | Erfassungsjahr | nein |
| `bienenvoelker` | Number | Gesamtzahl Bienenvölker in der Schweiz | nein |
| `veraenderung_abs` | Number | Veränderung zum Vorjahr in Völkern | ja, dann `null` (1994) |
| `veraenderung_prozent` | Number | Veränderung zum Vorjahr in % | ja, dann `null` (1994) |
| `phase` | String | `"Rückgang"` bis zum Tiefpunkt 2012, danach `"Erholung"` | nein |
| `niederschlag_mm` | Number | Jahresniederschlag, Mittel der 13 Stationen, mm | nein |

Feldnamen sind klein und ohne Umlaute, damit sie in SQL, PHP und JavaScript
gleich heissen.

## Filter

| Aufruf | Ergebnis |
| --- | --- |
| `unload.php` | alle Jahre |
| `unload.php?year=1994` | nur dieses Jahr |
| `unload.php?phase=rueckgang` | nur die Jahre im Rückgang (`rückgang` geht auch) |
| `unload.php?phase=erholung` | nur die Jahre der Erholung |

## Einrichten auf dem Webserver (Hostpoint)

1. `config.template.php` kopieren zu `config.php` und die Zugangsdaten aus
   dem Hostpoint Control Panel eintragen. Datei speichern – PhpStorm lädt sie
   per FTP hoch.
2. In phpMyAdmin die Datenbank wählen, Reiter **SQL**, Inhalt von
   `etl/schema.sql` einfügen und ausführen.
3. Im Browser einmal `…/IM3_Semesterprojekt/etl/load.php` aufrufen. Es sollten
   31 Zeilen geschrieben werden.
4. `…/IM3_Semesterprojekt/unload.php` aufrufen – das ist das JSON.
5. `…/IM3_Semesterprojekt/` öffnen – die Story.

Zum Prüfen ohne Datenbank: `etl/extract.php?debug=1` und
`etl/transform.php?debug=1` zeigen die Zwischenschritte.

## Offene Punkte

- **Wettereffekt:** Ob Niederschlag den Bestand beeinflusst, ist die
  Kernfrage. Idee: im Transform ein Feld wie `niederschlag_kategorie`
  (`"nass"`, `"normal"`, `"trocken"` im Vergleich zum Mittel) ergänzen.
- **Grenzen der Daten** im Kasten auf der Seite ausformulieren (z. B. ein
  Jahresmittel aus 13 Stationen, Säntis mit sehr viel Niederschlag; andere
  Ursachen wie Varroa-Milbe, Pestizide, Haltung).
