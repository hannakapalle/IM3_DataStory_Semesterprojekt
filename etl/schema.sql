-- Das Datenmodell für die Bienen-Datastory.
--
-- Anlegen in phpMyAdmin (Hostpoint Control Panel): eure Datenbank links
-- anklicken, Reiter «SQL», diesen Text einfügen und «OK».
--
-- Angelegt wird die Struktur genau einmal von Hand. Gefüllt wird sie danach
-- nur noch von etl/load.php.
--
-- Eine Zeile = ein Erfassungsjahr in der Schweiz.
-- jahr ist UNIQUE: jedes Jahr darf nur einmal vorkommen.
-- veraenderung_* dürfen NULL sein (das erste Jahr hat kein Vorjahr).
-- DECIMAL(6,2) heisst: sechs Ziffern, davon zwei nach dem Komma, z. B. -4.73.

CREATE TABLE bienenjahre (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  jahr                 SMALLINT NOT NULL UNIQUE,
  bienenvoelker        INT NOT NULL,
  veraenderung_abs     INT NULL,
  veraenderung_prozent DECIMAL(6,2) NULL,
  phase                VARCHAR(20) NOT NULL,
  niederschlag_mm      DECIMAL(6,1) NOT NULL
);
