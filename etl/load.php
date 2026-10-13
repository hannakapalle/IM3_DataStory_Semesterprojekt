<?php
/**
 * Load – das Ergebnis des Transforms in die Datenbank schreiben.
 *
 * Einmal im Browser aufrufen (https://eure-domain.ch/IM3_Semesterprojekt/etl/load.php),
 * danach liefert unload.php die Daten an die Story-Seite.
 *
 * Voraussetzung:
 *   - config.php im Projektordner (Vorlage: config.php)
 *   - Tabelle bienenjahre angelegt (etl/schema.sql in phpMyAdmin ausführen)
 */

header('Content-Type: text/plain; charset=utf-8');

require __DIR__ . '/../config.php';

// 1. Transform aufrufen: transform.php gibt direkt das $daten-Array zurück
$rows = include __DIR__ . '/transform.php';

if (!is_array($rows)) {
    exit("Fehler: transform.php hat keine gültigen Daten geliefert.\n");
}

echo 'Der Transform liefert ' . count($rows) . " Zeilen.\n\n";

// 2. Datenbankverbindung aufbauen
try {
    $pdo = new PDO($dsn, $username, $password, $options);
    echo "Verbindung steht.\n\n";
} catch (PDOException $e) {
    exit('Verbindung fehlgeschlagen: ' . $e->getMessage() . "\n");
}

// 3. Alten Stand löschen, um doppelte Einträge zu vermeiden.
$deleted = $pdo->exec('DELETE FROM bienenjahre');
echo $deleted . " alte Zeilen gelöscht.\n\n";

// 4. Prepared Statement vorbereiten (Keys ohne Doppelpunkte passen direkt zu $row)
$insert = $pdo->prepare(
    'INSERT INTO bienenjahre
       (jahr, bienenvoelker, veraenderung_abs, veraenderung_prozent, phase, niederschlag_mm, sonnenscheindauer_h, temperatur_c, neuschnee_cm)
     VALUES
       (:jahr, :bienenvoelker, :veraenderung_abs, :veraenderung_prozent, :phase, :niederschlag_mm, :sonnenscheindauer_h, :temperatur_c, :neuschnee_cm)'
);

// 5. Daten Zeile für Zeile in die Datenbank schreiben
foreach ($rows as $row) {
    $insert->execute([
        ':jahr'                 => $row['jahr'],
        ':bienenvoelker'        => $row['bienenvoelker'],
        ':veraenderung_abs'     => $row['veraenderung_abs'],
        ':veraenderung_prozent' => $row['veraenderung_prozent'],
        ':phase'                => $row['phase'],
        ':niederschlag_mm'      => $row['niederschlag_mm'],
        ':sonnenscheindauer_h'  => $row['sonnenscheindauer_h'],
        ':temperatur_c'         => $row['temperatur_c'],
        ':neuschnee_cm'         => $row['neuschnee_cm'],
    ]);
}

echo count($rows) . " Zeilen geschrieben.\n\n";

// 6. Kontrolle: Zählen und die letzten 3 Jahre zurücklesen.
$total = $pdo->query('SELECT COUNT(*) FROM bienenjahre')->fetchColumn();
echo "In bienenjahre stehen jetzt {$total} Zeilen.\n\n";

$check = $pdo->query(
    'SELECT jahr, bienenvoelker, veraenderung_prozent, phase, niederschlag_mm, temperatur_c, neuschnee_cm, sonnenscheindauer_h
     FROM bienenjahre
     ORDER BY jahr DESC
     LIMIT 3'
);

foreach ($check->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo $row['jahr'] . "\t"
        . $row['bienenvoelker'] . " Völker\t"
        . $row['veraenderung_prozent'] . " %\t"
        . $row['phase'] . "\t"
        . $row['niederschlag_mm'] . " mm\t"
        . $row['temperatur_c'] . " °C\t"
        . $row['neuschnee_cm'] . " cm\t"
        . $row['sonnenscheindauer_h'] . " h\n";
}