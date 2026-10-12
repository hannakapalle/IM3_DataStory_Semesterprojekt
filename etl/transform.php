<?php
/**
 * Transform – Rohdaten in den Datenvertrag bringen.
 *
 * Ergebnis: eine Zeile pro Jahr (1994–2024) mit genau diesen Feldern:
 *
 *   ['jahr' => 1995, 'bienenvoelker' => 269180, 'veraenderung_abs' => -758,
 *    'veraenderung_prozent' => -0.28, 'phase' => 'Rückgang',
 *    'niederschlag_mm' => 1331.8, 'sonnenscheindauer_h' => 1715.24,
 *    'temperatur_c' => 8.13, 'neuschnee_cm' => 256.95]
 *
 * Was hier passiert:
 *   1. Bienen: nur Jahr und Wert behalten, Text wird zu Zahl.
 *   2. Klima: Einlesen von Niederschlag, Sonnenschein, Temperatur und Neuschnee.
 *   3. Beide Quellen über das Jahr zusammenführen.
 *   4. Veränderung zum Vorjahr berechnen.
 *   5. Phase bestimmen: bis zum Tiefpunkt «Rückgang», danach «Erholung».
 *
 * Zum Anschauen im Browser aufrufen: etl/transform.php?debug=1
 */

$raw = include __DIR__ . '/extract.php';

$audit = [
    'bienen_zeilen' => count($raw['bienen']),
    'klima_zeilen'  => count($raw['klima']),
    'jahre_ohne_klima' => [],
    'output_rows'   => 0,
];

// ---------------------------------------------------------------------------
// 1. Bienen: Jahr => Anzahl Völker
// ---------------------------------------------------------------------------

$bienenProJahr = [];

foreach ($raw['bienen'] as$row) {
    if ((isset($row['Item']) &&$row['Item'] !== 'Bees') || (isset($row['Area']) &&$row['Area'] !== 'Switzerland')) {
        continue;
    }

    $jahr = isset($row['Year']) ? (int) $row['Year'] : (isset($row['Year Code']) ? (int) $row['Year Code'] : null);$wert = isset($row['Value']) ? (int)$row['Value'] : null;

    if ($jahr && $wert !== null) {$bienenProJahr[$jahr] =$wert;
    }
}

ksort($bienenProJahr);

// ---------------------------------------------------------------------------
// 2. Klimadaten: Jahr => Datenobjekt mit Niederschlag, Temp, Schnee, Sonne
// ---------------------------------------------------------------------------

$klimaProJahr = [];

foreach ($raw['klima'] as$row) {
    // 2a. Falls die neue 'klimadaten.csv' verwendet wird
    if (isset($row['Jahr']) || isset($row['jahr'])) {$jahr = (int) ($row['Jahr'] ?? $row['jahr']);

        // Hilfsfunktion zur Säuberung von Zahlenwerten
        $getFloat = function($key) use ($row) {
            if (!isset($row[$key])) return null;
            $v = trim($row[$key]);
            return (is_numeric($v)) ? (float)$v : null;
        };

        // Key-Matching für flexible Spaltennamen
        $sonne  = $getFloat('Jährliche Sonnenscheindauer, in Stunden') ?? $getFloat('sonnenscheindauer_h');
        $nieder =$getFloat('Jahresniederschlag in mm') ?? $getFloat('Jahresniederschlag in mm ') ?? $getFloat('niederschlag_mm');
        $temp   =$getFloat('Mittlere Jahrestemperatur in °C') ?? $getFloat('temperatur_c');$schnee = $getFloat('Neuschneemengen, Jahressumme der täglichen Aufzeichnungen in cm') ?? $getFloat('neuschnee_cm');

        // Fallback: Falls es sich um die alte Stationen-CSV handelt (Mittelwert