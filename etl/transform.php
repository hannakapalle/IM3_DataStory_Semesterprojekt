<?php
/**
 * Transform – Rohdaten in den Datenvertrag bringen.
 *
 * Ergebnis: eine Zeile pro Jahr (1994–2024) mit genau diesen Feldern:
 *
 *   ['jahr' => 1995, 'bienenvoelker' => 269180, 'veraenderung_abs' => -758,
 *    'veraenderung_prozent' => -0.28, 'phase' => 'Rückgang',
 *    'niederschlag_mm' => 1171.6]
 *
 * Was hier passiert:
 *   1. Bienen: nur Jahr und Wert behalten, Text wird zu Zahl.
 *   2. Niederschlag: Mittelwert der 13 Messstationen = ein Wert für die Schweiz.
 *   3. Beide Quellen über das Jahr zusammenführen.
 *   4. Veränderung zum Vorjahr berechnen.
 *   5. Phase bestimmen: bis zum Tiefpunkt «Rückgang», danach «Erholung».
 *
 * Zum Anschauen im Browser aufrufen: etl/transform.php?debug=1
 */

$raw = include __DIR__ . '/extract.php';

$audit = [
    'bienen_zeilen' => count($raw['bienen']),
    'niederschlag_zeilen' => count($raw['niederschlag']),
    'jahre_ohne_niederschlag' => [],
    'output_rows' => 0,
];

// ---------------------------------------------------------------------------
// 1. Bienen: Jahr => Anzahl Völker
// ---------------------------------------------------------------------------

$bienenProJahr = [];

foreach ($raw['bienen'] as $row) {
    // Sicherheitshalber nur Bienen in der Schweiz – FAOSTAT liefert sonst auch
    // andere Länder und Tiere, wenn man den Download anders einstellt.
    if ($row['Item'] !== 'Bees' || $row['Area'] !== 'Switzerland') {
        continue;
    }

    $bienenProJahr[(int) $row['Year']] = (int) $row['Value'];
}

ksort($bienenProJahr);

// ---------------------------------------------------------------------------
// 2. Niederschlag: Jahr => Mittelwert aller Stationen
// ---------------------------------------------------------------------------

$niederschlagProJahr = [];

foreach ($raw['niederschlag'] as $row) {
    $jahr = (int) $row['Jahr'];
    unset($row['Jahr']);

    // Übrig bleiben die 13 Stationen. Leere oder «...» Felder zählen nicht.
    $werte = array_filter($row, 'is_numeric');

    if (count($werte) === 0) {
        continue;
    }

    $niederschlagProJahr[$jahr] = round(array_sum($werte) / count($werte), 1);
}

// ---------------------------------------------------------------------------
// 3. + 4. Zusammenführen und Veränderung zum Vorjahr
// ---------------------------------------------------------------------------

$rows = [];
$vorjahr = null;

foreach ($bienenProJahr as $jahr => $voelker) {
    if (!isset($niederschlagProJahr[$jahr])) {
        $audit['jahre_ohne_niederschlag'][] = $jahr;
        continue;
    }

    // Das erste Jahr hat kein Vorjahr: dann null, nicht 0.
    // 0 würde behaupten «keine Veränderung» – das wissen wir aber nicht.
    $abs = null;
    $prozent = null;

    if ($vorjahr !== null) {
        $abs = $voelker - $vorjahr;
        $prozent = round($abs / $vorjahr * 100, 2);
    }

    $rows[] = [
        'jahr' => $jahr,
        'bienenvoelker' => $voelker,
        'veraenderung_abs' => $abs,
        'veraenderung_prozent' => $prozent,
        'phase' => null,
        'niederschlag_mm' => $niederschlagProJahr[$jahr],
    ];

    $vorjahr = $voelker;
}

// ---------------------------------------------------------------------------
// 5. Phase: Tiefpunkt suchen
// ---------------------------------------------------------------------------
//
// Bis und mit dem Jahr mit den wenigsten Völkern: «Rückgang».
// Danach: «Erholung».

$tiefpunkt = $rows[0];

foreach ($rows as $row) {
    if ($row['bienenvoelker'] < $tiefpunkt['bienenvoelker']) {
        $tiefpunkt = $row;
    }
}

foreach ($rows as $i => $row) {
    $rows[$i]['phase'] = $row['jahr'] <= $tiefpunkt['jahr'] ? 'Rückgang' : 'Erholung';
}

$audit['output_rows'] = count($rows);

$result = [
    'question' => 'Wie hat sich der Bienenbestand in der Schweiz von 1994 bis 2024 entwickelt, '
        . 'und hatte die Niederschlagsmenge einen Einfluss darauf?',
    'rules' => [
        'niederschlag' => 'Mittelwert der 13 MeteoSchweiz-Stationen pro Jahr',
        'tiefpunkt' => $tiefpunkt['jahr'],
    ],
    'data' => $rows,
    'audit' => $audit,
];

if (isset($_GET['debug']) && realpath($_SERVER['SCRIPT_FILENAME']) === __FILE__) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}

return $result;
