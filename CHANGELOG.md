# Änderungen

Neueste oben. Die Leitstelle auf der Startseite liest diese Datei, wenn
kein git da ist (z. B. bei einem ZIP-Download).

## Unveröffentlicht
- Fix Testlauf 10.10.: Ping länger und größer sichtbar (Empfangszeit statt Serveruhr), Sitz nach Entsperren bleibt, Boden meldet Fehler, SL-PIN und Browser-Schlüssel bleiben synchron, Frage-Feld verschiebt die Karte nicht mehr
- Feinschliff: Legion-Verbindung nimmt eingefügte Zeilen wie „Authorization: Bearer …“ an; Spieler am Handy: Live-Verbindung kommt nach Bildschirmsperre und Tunnel-Aussetzern selbst zurück, Karte verdeckt hochkant keine Knöpfe mehr, kein Doppelwurf bei langsamem Netz
- „Neustart nötig – neuer Code geladen“: Leitstelle und Fußzeile merken git pull bei laufendem Server, Neustart mit einem Klick
- Solo: zweiter Dungeon „Die versunkene Krypta“ mit acht Räumen, drei neuen Gegnern und dem Schleusenwärter, beim Start wählbar
- Testlauf hochladen: Knopf „Hochladen & Legion Bescheid geben“ schiebt den Lauf auf den Zweig testlaeufe und meldet ihn per Webhook
- Testlauf-Kachel: Checkliste aus docs/TESTLAUF.md mit O/X/Eigen, Bildern und Bericht unter data/testlaeufe/
- Leitstelle auf der Startseite: Status, QR-Code für Spieler, Adressen zum Kopieren, Patchnotes

## 2026-10-10
- Solo-Spiel: Dungeon-Lauf für einen Helden (#27)
- Startseite für den TV (#26)
- Liste-50: Bugs, Sicherheit, Tests (#25)
- Testlauf Oktober: Ladezeiten, Abstürze, Sicherheit, Solo/Bibliothek/Heft/Mediathek (#21)

## v0.4.0
- Spieler-Tabs sitzen nebeneinander im selben Browser (#1)
- start.bat hält Glut und Tunnel in einem Fenster
- Tunnel für einen Spieler zu Hause
