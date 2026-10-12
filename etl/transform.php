<?php
/**
 * Transform – Rohdaten in den Datenvertrag bringen.
 *
 * Ergebnis: eine Zeile pro Jahr (1994–2024) mit genau diesen Feldern:
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
    'bienen_zeilen'    => count($raw['bienen']),
    'klima_zeilen'     => count($raw['klima']),
    'jahre_ohne_klima' => [],
    'output_rows'      => 0,
];

// ---------------------------------------------------------------------------
// 1. Bienen: Jahr => Anzahl Völker
// ---------------------------------------------------------------------------

$bienenProJahr = [];

foreach ($raw['bienen'] as $row) {
    if ((isset($row['Item']) && $row['Item'] !== 'Bees') || (isset($row['Area']) && $row['Area'] !== 'Switzerland')) {
        continue;
    }

    $jahr = isset($row['Year']) ? (int) $row['Year'] : (isset($row['Year Code']) ? (int) $row['Year Code'] : null);
    $wert = isset($row['Value']) ? (int) $row['Value'] : null;

    if ($jahr && $wert !== null) {
        $bienenProJahr[$jahr] = $wert;
    }
}

ksort($bienenProJahr);

// ---------------------------------------------------------------------------
// 2. Klimadaten: Jahr => Datenobjekt mit Niederschlag, Temp, Schnee, Sonne
// ---------------------------------------------------------------------------

$klimaProJahr = [];

foreach ($raw['klima'] as $row) {
    if (isset($row['Jahr']) || isset($row['jahr'])) {
        $jahr = (int) ($row['Jahr'] ?? $row['jahr']);

        // Hilfsfunktion zur Säuberung von Zahlenwerten
        $getFloat = function($key) use ($row) {
            if (!isset($row[$key])) return null;
            $v = trim($row[$key]);
            return (is_numeric($v)) ? (float) $v : null;
        };

        // Key-Matching für flexible Spaltennamen
        $sonne  = $getFloat('Jährliche Sonnenscheindauer, in Stunden') ?? $getFloat('sonnenscheindauer_h');
        $nieder = $getFloat('Jahresniederschlag in mm') ?? $getFloat('Jahresniederschlag in mm ') ?? $getFloat('niederschlag_mm');
        $temp   = $getFloat('Mittlere Jahrestemperatur in °C') ?? $getFloat('temperatur_c');
        $schnee = $getFloat('Neuschneemengen, Jahressumme der täglichen Aufzeichnungen in cm') ?? $getFloat('neuschnee_cm');

        if ($jahr) {
            $klimaProJahr[$jahr] = [
                'niederschlag_mm'     => $nieder,
                'sonnenscheindauer_h' => $sonne,
                'temperatur_c'        => $temp,
                'neuschnee_cm'        => $schnee,
            ];
        }
    }
}

// ---------------------------------------------------------------------------
// 3. Tiefpunkt ermitteln (für Phasen-Zuweisung in Schritt 5)
// ---------------------------------------------------------------------------

$minWert = PHP_INT_MAX;
$tiefpunktJahr = null;

foreach ($bienenProJahr as $j => $w) {
    if ($w < $minWert) {
        $minWert = $w;
        $tiefpunktJahr = $j;
    }
}

// ---------------------------------------------------------------------------
// 4. & 5. Zusammenführen, Vorjahresvergleich & Phasen
// ---------------------------------------------------------------------------

$daten = [];
$vorjahrWert = null;

foreach ($bienenProJahr as $jahr => $bienenvoelker) {
    // Audit-Check: Gibt es Klimadaten für das Jahr?
    if (!isset($klimaProJahr[$jahr])) {
        $audit['jahre_ohne_klima'][] = $jahr;
    }

    $klima = $klimaProJahr[$jahr] ?? [
        'niederschlag_mm'     => null,
        'sonnenscheindauer_h' => null,
        'temperatur_c'        => null,
        'neuschnee_cm'        => null,
    ];

    // Veränderung berechnen
    $diffAbs = null;
    $diffPct = null;

    if ($vorjahrWert !== null) {
        $diffAbs = $bienenvoelker - $vorjahrWert;
        $diffPct = round(($diffAbs / $vorjahrWert) * 100, 2);
    }

    // Phase bestimmen
    $phase = ($tiefpunktJahr !== null && $jahr <= $tiefpunktJahr) ? 'Rückgang' : 'Erholung';

    $daten[] = [
        'jahr'                 => $jahr,
        'bienenvoelker'        => $bienenvoelker,
        'veraenderung_abs'     => $diffAbs,
        'veraenderung_prozent' => $diffPct,
        'phase'                => $phase,
        'niederschlag_mm'      => $klima['niederschlag_mm'],
        'sonnenscheindauer_h'  => $klima['sonnenscheindauer_h'],
        'temperatur_c'         => $klima['temperatur_c'],
        'neuschnee_cm'         => $klima['neuschnee_cm'],
    ];

    $vorjahrWert = $bienenvoelker;
}

$audit['output_rows'] = count($daten);

// ---------------------------------------------------------------------------
// Ausgabe / Export
// ---------------------------------------------------------------------------

if (isset($_GET['debug']) && $_GET['debug'] == 1) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['audit' => $audit, 'daten' => $daten], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

return $daten;