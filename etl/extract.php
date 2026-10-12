<?php
/**
 * Extract – Rohdaten einlesen.
 *
 * Liest die CSV-Dateien aus etl/data/ und gibt sie unverändert als
 * PHP-Array weiter. Hier wird noch nichts gerechnet oder umbenannt – das ist
 * die Aufgabe von transform.php.
 *
 *   bienen_schweiz.csv   FAOSTAT, Bienenvölker Schweiz 1994–2024
 *   klimadaten.csv      MeteoSchweiz/BFS, Sonnenschein, Niederschlag,
 *                       Temperatur, Neuschnee 1994–2024
 *
 * Zum Anschauen im Browser aufrufen: etl/extract.php?debug=1
 */

function readCsv(string $file, string $delimiter = ','): array
{
    $handle = fopen($file, 'r');

    if ($handle === false) {
        throw new RuntimeException("Datei nicht gefunden: {$file}");
    }

    // Erste Zeile auslesen (Header)
    $header = fgetcsv($handle, null, $delimiter, '"', '');

    $rows = [];

    while (($values = fgetcsv($handle, null, $delimiter, '"', '')) !== false) {
        // Leere Zeilen am Dateiende überspringen
        if ($values === [null] || empty($values) || $values[0] === null) {
            continue;
        }

        // Header und Werte zu assoziativem Array verbinden
        if (count($header) === count($values)) {
            $rows[] = array_combine($header, $values);
        }
    }

    fclose($handle);

    return $rows;
}

// Erkennen, welche Klimadatei im Ordner data/ liegt (Semikolon oder Komma)
$klimaFile = __DIR__ . '/data/klimadaten.csv';
$klimaDelimiter = ';'; // Klimadaten nutzen meist Semikolon

if (!file_exists($klimaFile)) {
    // Fallback auf die alte Datei, falls klimadaten.csv noch nicht im Ordner liegt
    $klimaFile = __DIR__ . '/data/jahresniederschlag.csv';
    $klimaDelimiter = ',';
}

$raw = [
    'bienen' => readCsv(__DIR__ . '/data/bienen_schweiz.csv', ','),
    'klima'  => readCsv($klimaFile, $klimaDelimiter),
];

// Nur beim direkten Aufruf mit ?debug=1 anzeigen, sonst still weitergeben.
if (isset($_GET['debug']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($raw, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}

return $raw;