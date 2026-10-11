# Ember

**Ember** ist ein lokales Webtool für den Pen&Paper-Tisch (gebaut für *Daggerheart / Age of Umbra*).
Ein einziger Node.js-Prozess ohne Abhängigkeiten serviert den Spielleitungs-Tisch, die
Spieler-Ansicht im LAN und ein paar Solo-Werkzeuge. Nichts läuft in der Cloud — der SL-Rechner
ist der Server, die Daten liegen in `data/ember.json`.

## Voraussetzungen

- Windows 10 oder 11 für die `.bat`, sonst `npm start`
- [Node.js](https://nodejs.org) (LTS, getestet mit Node 20 und 24) von der Seite, nicht aus einer zufälligen Quelle
- Ein Browser (Brave, Chrome, Edge …); `start.bat` öffnet `http://127.0.0.1:3478/` im Standardbrowser
- Für Spieler zu Hause zusätzlich [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- Keine `npm install`-Schritte nötig — das Projekt hat **null Abhängigkeiten**

## Erststart

Lies das, bevor du eine `.bat` doppelklickst. Eine Batch-Datei ist ein Skript, sie kann Programme starten. Öffne `start.bat` deshalb zuerst im Editor und lies sie, erst danach der Doppelklick. Sie lädt nichts herunter. Sie startet aber nicht nur den lokalen Server: Ist cloudflared installiert, öffnet sie über `tools\tunnel.js` gleich beim ersten Start auch einen Cloudflare-Tunnel, also einen Weg ins Netz, über den Spieler von zu Hause `/player` erreichen. Ohne cloudflared bleibt es beim lokalen Server für Spieler im selben WLAN.

### Reihenfolge

1. `start.bat` im Editor öffnen und lesen.
2. Doppelklick. Beim ersten Start fragt das Fenster nach der Spielleiter-PIN.
3. Die Glut-Animation läuft rund 10 Sekunden (jede Taste überspringt sie), danach öffnet sich `http://127.0.0.1:3478/` im Standardbrowser. Das ist der Technik-Tisch.
4. Ember ist die Glut. Spieler im selben WLAN nehmen die Adresse aus der Leiste.
5. Zu Hause: das Fenster von `start.bat` offen lassen. Sobald der Tunnel steht, springt der Fenstertitel von `DYE.TV - Cloud OFF` auf `DYE.TV - Cloud ON`. Die Adresse mit `/player` steht dann in der Leitstelle. Die an die Spieler schicken.

### Spielleiter-PIN

Beim ersten Start fragt `start.bat` im Fenster nach der Spielleiter-PIN (mindestens 4 Zeichen). Geschrieben wird sie von Node (`tools\slpin.js`) nach `data\sl.pin`, nicht von cmd. Steht dort noch ein Rest wie „ECHO ist ausgeschaltet (OFF).“ von einem älteren Stand, erkennt `start.bat` das beim nächsten Start und fragt neu. Leere Eingabe zählt nicht. Eine neue PIN gilt nach dem Neustart auch als SL-Schlüssel; offene SL-Seiten einmal neu laden.

PIN später ändern: `data\sl.pin` löschen und `start.bat` neu starten.

### Ember.bat gibt es nicht mehr

`Ember.bat` hat `start.bat` nur minimiert gestartet und Edge geöffnet. Minimiert sieht man die PIN-Frage beim ersten Start nicht, und der Browser der Wahl ist Brave. Deshalb: immer `start.bat`. Den Browser öffnet sie selbst. QuickEdit im Konsolenfenster ausschalten (Fenster → Eigenschaften), sonst hält ein Klick ins Fenster den Server an.

Daten liegen in `data/`. Die ist nicht im Repo. Ein Update zieht nur den Code.


### Windows (Doppelklick)

| Datei        | Was sie tut                                                        |
| ------------ | ------------------------------------------------------------------ |
| `start.bat`  | Prüft Node, fragt beim ersten Mal die SL-PIN, startet Server und Tunnel, Glut-Animation, öffnet den Browser, Neustart-Schleife |

Tests laufen auch unter Windows mit `npm test`.

### Überall sonst

```bash
npm start        # Server auf Port 3478
npm test         # Alle Tests
```

Umgebungsvariablen: `EMBER_PORT` (Standard `3478`), `EMBER_HOST` (Standard `0.0.0.0`).

Die Adressen stehen im Fenster. Der Fenstertitel zeigt nur `DYE.TV - Cloud OFF` oder `DYE.TV - Cloud ON`. ON gilt, solange der Tunnel steht. Bricht er weg (kein Internet), springt der Titel zurück auf OFF. Offline läuft alles am Tisch weiter, der Browser geht trotzdem auf.

Beim Start aus `start.bat` laufen Server und Glut-Animation parallel. Nach der Animation öffnet sich `http://127.0.0.1:<EMBER_PORT>/` einmal im Standardbrowser, bei Neustarts aus der App nicht noch einmal. Abschalten mit `set DYE_NO_ANIM=1` (keine Animation) oder `set DYE_NO_BROWSER=1` (kein Browser) vor `start.bat`. `npm start` zeigt beides nicht. Cloudflare-Pings gehen nach `data/tunnel.log` und schieben sie nicht mehr weg. Die Spielleitung ist `http://127.0.0.1:3478/ember`, nicht die Tunnel-Adresse.

## Die Seiten

| Pfad          | Zweck                                                            |
| ------------- | ---------------------------------------------------------------- |
| `/`            | Startseite am SL-Rechner: Kacheln und Leitstelle (Status, Spieler-QR, Adressen, Patchnotes). Die Kachel „Einstellungen“ schaltet die rechte Spalte um |
| `/ember`       | SL-Tisch: Session, Action Rolls, Events, Karte, Initiative      |
| `/player`      | Spieler-Ansicht: Namen antippen, Bogen, Würfe, Spotlight        |
| `/player?as=ID&tab=1` | Derselbe Bogen in einem eigenen Tab, ohne die anderen Tabs zu übernehmen |
| `/token`       | Pixel-Token-Atelier                                              |
| `/pixelstube`  | Pixelstube: Raster, Palette, Stift, Füllen, PNG                 |
| `/solo`        | Solo-Spiel: Dungeon-Lauf mit einem Helden (Werkstatt: `/solo/werkstatt`) |
| `/karten`      | Karten-Werkzeug (Marker-Karten speichern/laden)                   |
| `/bibliothek`  | Regel-PDFs aus `docs/bibliothek/`                                 |
| `/runner`      | Ereignis: Dye-Runner, vom SL in die Runde geworfen               |
| `/fallwerk`    | Ereignis: 3D-Physik                                              |
| `/pastellpfad` | Ereignis: First-Person-Labyrinth                                 |
| `/scharfschuss`| Ereignis: Turmverteidigung                                       |
| `/puls`        | Ereignis: Live-Umfrage                                           |
| `/heft`        | Heft: Notizen mit Markdown, Suche und lokaler Speicherung         |
| `/home`        | Wie `/`, ebenfalls nur am SL-Rechner                              |

Die Spieler-URLs zeigt der Server beim Start an (z. B. `http://192.168.0.151:3478/player`).
Am SL-Rechner öffnet **Tab** neben einem Bogen `/player?as=<id>&tab=1`. Der Sitz liegt dann nur in diesem Tab (`sessionStorage`), nicht im gemeinsamen `localStorage`. Ein normales `/player` merkt sich den Bogen weiter fürs Handy.
Spieler verbinden sich über das WLAN — der SL-Rechner muss Port 3478 in der
Windows-Firewall erlauben (beim ersten Start bestätigen).

## Leitstelle

Die rechte Spalte der Startseite zeigt Serverlaufzeit, Version, Tunnel, wer am
Tisch ist, Datenstand, den letzten Absturz, einen QR-Code für `/player` und die
Adressen mit Knopf zum Kopieren. Die Daten kommen von `/api/leitstelle`. Diese
Schnittstelle antwortet nur am SL-Rechner selbst, nie über den Tunnel. Die
Patchnotes stammen aus git oder, ohne git, aus `CHANGELOG.md`. Wie man ein
eigenes Modul ergänzt, steht in [`docs/MODULE.md`](docs/MODULE.md).

## DEBUG_Run (`/debug-run`, alt `/testlauf`)

Kachel „DEBUG_Run“ auf der Startseite (nur SL-Rechner): Checkliste aus
`docs/TESTLAUF.md` mit O/X/Eigen und Notizen, Bilder bis 50 MB, Entwurf
mit Autosave. „Alles ablegen“ schreibt `data/testlaeufe/<Datum_Uhrzeit>/`
mit `bericht.md`, `bericht.json` und `bilder/`. „Hochladen & Legion
Bescheid geben“ schiebt den Lauf auf den Zweig `testlaeufe` und meldet ihn
per Webhook, siehe [`docs/TESTLAUF-UPLOAD.md`](docs/TESTLAUF-UPLOAD.md).
Ordner (`data/testlaeufe/`), Zweig `testlaeufe` und die alte Adresse
`/testlauf` bleiben wie gehabt.

**Erst DEBUG_Run, dann online.** Über den Cloudflare-Tunnel kommen Spieler
erst an den Tisch, wenn der DEBUG_Run des Tages abgelegt und mit „Hochladen &
Legion Bescheid geben“ hochgeladen ist (GitHub geschafft und, falls ein
Webhook eingerichtet ist, Legion erreicht). Bis dahin zeigen Leitstelle und
Fußzeile „Offline – erst DEBUG_Run“, und Tunnel-Besucher sehen „Der Tisch
öffnet gleich – der Spielleiter macht noch seinen DEBUG_Run“ (lädt alle 20 s
neu). WLAN und dieser Rechner laufen immer normal.

- Das Tor gilt pro Spieltag nach lokaler Uhr. Der Spieltag wechselt um
  06:00 Uhr, damit ein Abend über Mitternacht nicht mittendrin zugeht. Ein
  Neustart des Servers ändert nichts (Stand in `data/debug-run.json`).
- Notausgang nur am SL-Rechner: „Ohne DEBUG_Run online gehen“ in der
  Leitstelle oder auf der DEBUG_Run-Seite (zweimal klicken). Steht mit
  Uhrzeit in `data/debug-run.log`.
- `set DYE_DEBUG_RUN_PFLICHT=0` vor `start.bat` schaltet das Tor ganz ab
  (gedacht für Tests).

## Solo-Spiel (`/solo`)

Ein Held, ein kurzer Dungeon (sieben Räume, fünf davon auf dem Weg, zuletzt der
Glutwächter). Daggerheart-Regeln wie am Tisch: Duality-Wurf mit Hope- und
Fear-W12, Experiences kosten Hope, Schaden gegen Major/Severe, Armor fängt eine
Stufe ab, kurze Rast mit zwei Aktionen. Nach einem Sieg gibt es ein Level-Up.

- Steuerung nur mit Klicks (Wii-Zeiger), Tasten 1–9 optional
- Spielstand in `data/solo.json`, übersteht Neuladen und Neustart
- Regeln in `lib/dungeon.js`, API in `lib/solo-game.js`
- Bilder: Platzhalter in `public/solo/sprites/`, gleiche Dateinamen ersetzen (siehe `LIESMICH.md` dort)
- Die alte Übungsseite (Bots, Übungskarte, Level-Up für Kampagnen-Bögen) liegt unter `/solo/werkstatt`

## Projektstruktur

```
server.js            HTTP-Server + komplette REST-/SSE-API (kein Framework)
lib/
  store.js           Datenspeicher (data/ember.json, Migrationen, Encounters)
  dice.js            Duality-Wurf (Hope/Fear d12, Advantage, Experiences)
  initiative.js      Rundenreihenfolge, Gegenseite, Spotlight
  solo.js            Bots, Dungeon, Subklassen, Level-Ups
  compendium.js      SRD-Suche (compendium-data.json)
  catalog.js         Sablewood-Quickstart (vorgefertigte Bögen, Startkarte)
  auth.js            Lokal-/Tunnel-Pruefung, SL-Schluessel
  guard.js           Sperre gegen fremde Webseiten (CSRF)
  range.js           Range-Header fuer Video-Streaming
  spur.js            Punkte der Minispiele
  spark.js, lan.js, ids.js   Terminal-Deko, LAN-Adressen, IDs/PINs
public/              Statisches Frontend (Vanilla JS, kein Build-Schritt)
  index.html         SL-Tisch (gm.js, map.js, …)
  player.html        Spieler-Ansicht (player.js)
  js/, css/, maps/, icons/, data/
tools/tunnel.js      Cloudflare-Tunnel fuer Spieler von zu Hause (startet mit start.bat)
test/                node:test-Suiten (Logik + Server-Tests ueber HTTP)
data/                Laufzeitdaten (gitignored): ember.json, ember.json.bak, uploads/
                     anderer Ordner per Umgebungsvariable EMBER_DATA
docs/bibliothek/     PDFs für die Bibliotheksseite (index.json, maps/, errata.json)
docs/regeln/         Regel-PDFs (z. B. DH-SRD.pdf), ebenfalls in der Bibliothek
docs/TESTLAUF.md     Checkliste Testlauf
.github/workflows/   CI: Syntax-Check + Tests bei push/PR
```

## Tests

```bash
npm test
```

Abgedeckt sind die Kernlogik und ein echter Server-Start:

- `test/dice.test.js` — Duality-Ergebnisse, Critical, Advantage/Disadvantage, Experience-Kosten
- `test/initiative.test.js` — Seed, Runden, Gegenseite, Spotlight-Vorrücken, auto=aus
- `test/solo.test.js` — Bots, Dungeon, Level-Ups, Subklassen
- `test/store.test.js` — Fog-of-War-Standards, `patchById`, Encounter-/Bogen-Erzeugung
- `test/auth.test.js` — GM-Key-Logik (`isGm`, `recordGmKey`), Tunnel gilt nicht als lokal
- `test/range.test.js` — Range-Header für Video-Streaming (Suffix, 416 bei Unsinn)
- `test/guard.test.js` — Sperre gegen fremde Webseiten, Tunnel-Spieler bleiben erlaubt
- `test/lan.test.js` — beste LAN-Adresse zuerst, ohne WSL/Link-Local
- `test/data.test.js` — `EMBER_DATA`, Sicherung `ember.json.bak`
- `test/server.test.js` — startet `server.js` in einem Temp-Ordner und prüft die API über HTTP

Für Testläufe von Hand: [docs/TESTLAUF.md](docs/TESTLAUF.md) — Checkliste zum Ausdrucken.

## Daten & Betrieb

- Der gesamte Zustand liegt in `data/ember.json` (atomar über Temp-Datei + Rename geschrieben).
  Hochgeladene Bilder/Tokens landen in `data/uploads/`. Beides ist gitignored.
- Das Session-Log wird bei 500 Einträgen gekappt, Undo hält die letzten 15 Aktionen.
- **Update:** Im Zahnrad-Menü der SL-Seite („Jetzt prüfen & ziehen") macht der Server
  `git fetch` + `git pull --ff-only` und installiert bei geändertem `package.json` neu.
  Danach beendet er sich mit Exit-Code 42 — `start.bat` startet ihn automatisch neu.
  Neustart und Update sind nur vom SL-Rechner (localhost) erlaubt.
- **Presence:** SL und Spieler melden sich alle 4 s; Einträge älter als 15 s gelten als fort.
- **GM-Schlüssel:** Der SL-Rechner erzeugt beim ersten Presence-Ping einen `gmKey` (nur von
  localhost). Sobald der Schlüssel bekannt ist, müssen alle `as:"gm"`-Routen ihn mitsenden —
  Spieler im LAN können die SL-Routen dann nicht mehr aufrufen.
- **Spieler zu Hause:** `start.bat` startet den Tunnel (`tools\tunnel.js`) neben der Glut gleich mit. Dafür [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) installieren; fehlt es, meldet das Fenster „cloudflared fehlt.“ und der Server läuft ohne Tunnel weiter. Läuft der Server schon ohne Tunnel, reicht `node tools\tunnel.js` in einem zweiten Fenster. Die Adresse steht in der Leiste und endet auf `/player`. Eine feste Adresse kann als `DYE_PUBLIC_URL` gesetzt werden.


## Regeln

Die kompendierte SRD-Suche nutzt das Daggerheart SRD 2.0 (Darrington Press Community
Gaming License). Das Regel-PDF liegt unter `docs/regeln/DH-SRD.pdf`.

## Beitragen

Kleine Commits, Tests grün halten (`npm test`), dann pushen — die GitHub Action prüft
Syntax und Suite automatisch. Format: kein Linter eingerichtet; dem Stil der Nachbardatei
folgen (2 Spaces, `const`, Template-Strings).
