<?php
/**
 * Vorlage für die Zugangsdaten zur Datenbank.
 *
 * So legt ihr eure eigene Fassung an – hier im Projektordner:
 *
 *     cp config.template.php config.php
 *
 * Dann die vier Werte aus dem Hostpoint Control Panel eintragen.
 * config.php steht in .gitignore und landet nie auf GitHub. PhpStorm lädt sie
 * trotzdem per FTP auf den Server, denn dort wird sie gebraucht.
 *
 * Hostpoint setzt den Namen eures Kontos vor Host, Datenbank und Benutzer:
 *
 *   Host       konto.mysql.db.hostpoint.ch
 *   Datenbank  konto_im3
 *   Benutzer   konto_im3
 */

$host     = '';
$dbname   = '';
$username = '';
$password = '';

$dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];
