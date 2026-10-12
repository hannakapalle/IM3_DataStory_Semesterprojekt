<?php
/**
 * Unload – JSON-Endpunkt für die Story-Seite.
 *
 * Antwortet auf:
 *
 *   GET unload.php                  alle Jahre 1994–2024
 *   GET unload.php?year=1994        nur ein Jahr
 *   GET unload.php?phase=rueckgang  nur die Jahre einer Phase
 *                                   (rueckgang, rückgang oder erholung)
 *
 * Ist die Datenbank nicht erreichbar, fällt script.js auf
 * data/bienenjahre.json zurück.
 */

header('Content-Type: application/json; charset=utf-8');

if (!file_exists(__DIR__ . '/config.php')) {
    http_response_code(500);
    echo json_encode(['error' => 'config.php fehlt – siehe config.php.']);
    exit;
}

require __DIR__ . '/config.php';

function normalizeJahr(array $row): array
{
    return [
        'jahr' => (int) $row['jahr'],
        'bienenvoelker' => (int) $row['bienenvoelker'],
        'veraenderung_abs' => $row['veraenderung_abs'] === null
            ? null
            : (int) $row['veraenderung_abs'],
        'veraenderung_prozent' => $row['veraenderung_prozent'] === null
            ? null
            : (float) $row['veraenderung_prozent'],
        'phase' => $row['phase'],
        'niederschlag_mm' => $row['niederschlag_mm'] === null ? null : (float) $row['niederschlag_mm'],
        'sonnenscheindauer_h' => $row['sonnenscheindauer_h'] === null ? null : (float) $row['sonnenscheindauer_h'],
        'temperatur_c' => $row['temperatur_c'] === null ? null : (float) $row['temperatur_c'],
        'neuschnee_cm' => $row['neuschnee_cm'] === null ? null : (float) $row['neuschnee_cm'],
    ];
}

$year = trim($_GET['year'] ?? '');
$phase = mb_strtolower(trim($_GET['phase'] ?? ''));

// Erlaubte Schreibweisen in der URL => Wert in der Datenbank
$phasen = [
    'rueckgang' => 'Rückgang',
    'rückgang' => 'Rückgang',
    'erholung' => 'Erholung',
];

try {
    $pdo = new PDO($dsn, $username, $password, $options);

    $sql = 'SELECT jahr, bienenvoelker, veraenderung_abs, veraenderung_prozent,
                   phase, niederschlag_mm, sonnenscheindauer_h, temperatur_c, neuschnee_cm
            FROM bienenjahre';

    $where = [];
    $params = [];

    if ($year !== '') {
        $where[] = 'jahr = :jahr';
        $params['jahr'] = (int) $year;
    }

    if ($phase !== '') {
        if (!isset($phasen[$phase])) {
            http_response_code(400);
            echo json_encode(['error' => 'Unbekannte Phase. Erlaubt: rueckgang, erholung.']);
            exit;
        }

        $where[] = 'phase = :phase';
        $params['phase'] = $phasen[$phase];
    }

    if (count($where) > 0) {
        $sql .= ' WHERE ' . implode(' AND ', $where);
    }

    $sql .= ' ORDER BY jahr';

    $statement = $pdo->prepare($sql);
    $statement->execute($params);

    $data = array_map('normalizeJahr', $statement->fetchAll());

    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    error_log('unload.php: ' . $error->getMessage());

    echo json_encode([
        'error' => 'Daten konnten nicht geladen werden.',
    ]);
}