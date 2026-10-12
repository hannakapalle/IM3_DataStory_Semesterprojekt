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

$result = include __DIR__ . '/transform.php';
$rows = $result['data'];

echo 'Der Transform liefert ' . count($rows) . " Zeilen.\n\n";

try {
    $pdo = new PDO($dsn, $username, $password, $options);
    echo "Verbindung steht.\n\n";
} catch (PDOException $e) {
    exit('Verbindung fehlgeschlagen: ' . $e->getMessage() . "\n");
}

// Alten Stand löschen, um doppelte Einträge zu vermeiden.
$deleted = $pdo->exec('DELETE FROM bienenjahre');
echo $deleted . " alte Zeilen gelöscht.\n\n";

// prepare() einmal vor der Schleife, execute() pro Zeile.
$insert = $pdo->prepare(
    'INSERT INTO bienenjahre
       (jahr, bienenvoelker, veraenderung_abs, veraenderung_prozent, phase, niederschlag_mm, sonnenscheindauer_h, temperatur_c, neuschnee_cm)
     VALUES
       (:jahr, :bienenvoelker, :veraenderung_abs, :veraenderung_prozent, :phase, :niederschlag_mm, :sonnenscheindauer_h, :temperatur_c, :neuschnee_cm)'
);

foreach ($rows as $row) {
    $insert->execute($row);
}

echo count($rows) . " Zeilen geschrieben.\n\n";

// Kontrolle: zählen und ein paar Werte zurücklesen.
$total = $pdo->query('SELECT COUNT(*) FROM bienenjahre')->fetchColumn();
echo "In bienenjahre stehen jetzt {$total} Zeilen.\n\n";

$check = $pdo->query(
    'SELECT jahr, bienenvoelker, veraenderung_prozent, phase, niederschlag_mm, temperatur_c, neuschnee_cm, sonnenscheindauer_h
     FROM bienenjahre
     ORDER BY jahr DESC
     LIMIT 3'
);

foreach ($check->fetchAll() as $row) {
    echo $row['jahr'] . "\t"
        . $row['bienenvoelker'] . " Völker\t"
        . $row['veraenderung_prozent'] . " %\t"
        . $row['phase'] . "\t"
        . $row['niederschlag_mm'] . " mm\t"
        . $row['temperatur_c'] . " °C\t"
        . $row['neuschnee_cm'] . " cm\t"
        . $row['sonnenscheindauer_h'] . " h\n";
}