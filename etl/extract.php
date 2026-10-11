<?php
/**
 * Extract – Rohdaten einlesen.
 *
 * Liest die beiden CSV-Dateien aus etl/data/ und gibt sie unverändert als
 * PHP-Array weiter. Hier wird noch nichts gerechnet oder umbenannt – das ist
 * die Aufgabe von transform.php.
 *
 *   bienen_schweiz.csv      FAOSTAT, Bienenvölker Schweiz 1994–2024
 *   jahresniederschlag.csv  MeteoSchweiz/BFS, Jahresniederschlag in mm,
 *                           13 Messstationen, 1931–2024
 *
 * Zum Anschauen im Browser aufrufen: etl/extract.php?debug=1
 */

function readCsv(string $file): array
{
    $handle = fopen($file, 'r');

    if ($handle === false) {
        throw new RuntimeException("Datei nicht gefunden: {$file}");
    }

    // Die erste Zeile enthält die Spaltennamen.
    $header = fgetcsv($handle, null, ',', '"', '');

    $rows = [];

    while (($values = fgetcsv($handle, null, ',', '"', '')) !== false) {
        // Leere Zeilen am Dateiende überspringen.
        if ($values === [null]) {
            continue;
        }

        // Aus [1994, 269938, ...] wird ['Year' => 1994, 'Value' => 269938, ...]
        $rows[] = array_combine($header, $values);
    }

    fclose($handle);

    return $rows;
}

$raw = [
    'bienen' => readCsv(__DIR__ . '/data/bienen_schweiz.csv'),
    'niederschlag' => readCsv(__DIR__ . '/data/jahresniederschlag.csv'),
];

// Nur beim direkten Aufruf mit ?debug=1 anzeigen, sonst still weitergeben.
if (isset($_GET['debug']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($raw, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}

return $raw;
