# Testlauf-Checkliste

Drei Geräte: Laptop (SL, `start.bat`), 4K-TV mit Zeiger-Fernbedienung, Handy eines Freundes über mobile Daten.
Abhaken, Zeiten notieren, Auffälliges unten eintragen.
Datum: ________ Version (`git log --oneline -1`): ________________

## Start am Laptop

- [ ] `start.bat` gestartet, `http://127.0.0.1:3478/ember` lädt am Laptop nach ______ s.
- [ ] In `/ember` die Session gestartet, die Karte ist am Laptop zu sehen.

## Handy des Freundes (mobile Daten)

- [ ] Der Freund scannt den Spieler-QR auf der Startseite (oder bekommt die Tunnel-Adresse aus „Adressen zum Kopieren“ per Messenger) und `/player` lädt nach ______ s.
- [ ] Am Handy ein Profil mit Name und PIN angelegt, Meldung „sitzt“ erscheint.

## TV (4K)

- [ ] Am TV `http://<Laptop-IP>:3478/player` geöffnet und „Als Gast (Karte + Video)“ gewählt, die Karte ist zu sehen.

## Live zwischen allen drei

- [ ] Am Laptop ein Token verschoben: TV und Handy zeigen die neue Stelle nach ______ s.
- [ ] Am Handy das eigene Token verschoben: Laptop und TV zeigen die neue Stelle.

## Würfeln

- [ ] Am Handy „Würfeln“ getippt: das Ergebnis steht am Handy und nach ______ s im Log am Laptop.

## Verbindung weg und zurück

- [ ] Handy 10 s in den Flugmodus und zurück: `/player` verbindet sich selbst wieder und Würfeln geht.

## Abschluss

- [ ] „Hochladen & Legion Bescheid geben“ getippt: die Seite meldet „Hochgeladen“ und „Legion hat Bescheid bekommen.“

## Notizen

| Seite | Ergebnis | Zeit | Bemerkung |
|-------|----------|------|-----------|
|       |          |      |           |
|       |          |      |           |
|       |          |      |           |
|       |          |      |           |
|       |          |      |           |
