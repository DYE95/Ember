# DYE.TV – Vision aus der Discord-Nachbesprechung

> Geschrieben von einem Freund aus Daves Runde nach dem Testlauf vom 10.10.2026. Ideen und Gedanken, keine Bauliste: Was davon umgesetzt wird, entscheidet Dave.


## 1. Vorwort: Was ich zuerst schützen würde 

Bevor ich irgendetwas ändere, würde ich drei Dinge festschreiben, die nicht verhandelbar sind. Weil jede Veränderung, die diese drei antastet, das Projekt kaputt macht, egal wie gut sie gemeint ist.

**Erstens: DYE.TV ist Daves Tisch.** Es ist kein Produkt. Es hat keine „Nutzer", es hat *dich und deine Runde*. Jede Entscheidung muss an der Frage gemessen werden: „Macht das den Dienstagabend besser?" Nicht: „Würde das jemand anderes auch cool finden?" Dieses Framing ist der Grund, warum das Projekt so eigen ist. Wenn du anfängst, für eine imaginäre Zielgruppe zu bauen, baust du Foundry, und Foundry ist schlechter als DYE.TV  für *deine* Runde.

**Zweitens: Null Abhängigkeiten bleibt.** Nicht als Dogma, sondern weil jede Abhängigkeit ein Versprechen ist, das du irgendwann einlösen musst. Wenn du React hinzufügst, musst du in zwei Jahren React 20 migrieren. Wenn du `npm install` zulässt, muss dein Freund, der das auf seinem Laptop startet, `npm install` verstehen. Die Null-Abhängigkeits-Regel ist der Grund, warum Ember von einem ZIP-Download läuft. Das ist Gold wert.

**Drittens: Der Server ist der SL-Rechner.** Nicht die Cloud, nicht ein VPS, nicht ein Docker-Container. Das Ding läuft auf deinem PC, im selben Raum, in dem die Leute sitzen. Das ist die zentrale Sicherheitseigenschaft. Kein Login, kein Passwort-Drama, keine „Ich habe mein Passwort vergessen"-Mail. Wer in deinem WLAN ist, ist am Tisch. Punkt.

Wenn ich diese drei schütze, kann ich alles andere anfassen. Wenn ich sie aufgebe, ist es nicht mehr das Repo was es mal wahr.

---

## 2. Die Architektur: Was ich umbauen würde

### 2.1 `server.js` aufteilen – aber richtig

`server.js` hat 1100+ Zeilen. Das ist nicht *per se* schlimm; ein einzelner Server mit Routen ist lesbar, wenn er konsequent strukturiert ist. Aber die Mischung aus HTTP, SSE, Business-Logik, Routing und Spezialfällen wie `newerPageHint` wird irgendwann zum Problem.

Mein Vorschlag: **nicht** in 20 Mikromodule zerlegen wie in einem Express-Projekt. Sondern in vier saubere Schichten:

- `server.js` – nur noch HTTP-Server, statische Dateien, Header, Fehlerbehandlung auf oberster Ebene.
- `routes/` – ein Modul pro Domäne: `routes/session.js`, `routes/map.js`, `routes/campaigns.js`, `routes/solo.js`, `routes/testlauf.js`, `routes/leitstelle.js`.
- `service/` – die Logik, die mehrere Module braucht, z. B. `service/presence.js`, `service/broadcast.js`, `service/state.js` für `snapshot()`.
- `lib/` – bleibt reine Logik ohne Server (dice, initiative, store, dungeon, spur, ids, auth).

Der Gewinn ist nicht „schöner Code". Der Gewinn ist, dass du **eine Route findest**, ohne 1100 Zeilen zu scrollen. Bei jedem neuen Feature (und du baust viele) sparst du 20 Minuten Suchzeit. Nach einem Jahr ist das ein halber Arbeitstag.

### 2.2 Der Speicher: `ember.json` bleibt, aber mit Geschichte

`data/ember.json` ist eine große JSON-Datei. Das ist für die Größe perfekt. Was fehlt, ist **Versionierung im Dateisystem**, nicht in der Datei.

Ich würde eine `data/history/`-Struktur bauen:
- Bei jedem Schreibvorgang, der mehr als N Einträge betrifft, wird eine Momentaufnahme als `history/2026-10-11T20-15.json` geschrieben.
- Die letzten 50 bleiben.
- Ein `/api/rewind`-Endpoint kann einen Zeitpunkt wiederherstellen.
- Die UI zeigt eine Zeitleiste: „Session vom 11.10., 20:15 — 14 Charaktere, Fear 3."

Kein Undo innerhalb eines Abends – das hast du schon. Aber ein **Undo über Wochen**: „Ich habe letzte Woche versehentlich einen Charakter gelöscht, hilf mir."

Und dann eine zweite Sache: **jede Session wird als eigener Ordner abgelegt.** `data/sessions/2026-10-11/` enthält `state.json` (die Session, wie sie begann), `log.json` (nur der Log), `recap.md` (siehe unten). Nach einem halben Jahr hast du ein Archiv deiner Kampagne, das du durchsuchen kannst.

### 2.3 `public/js/`: ein Mini-Build ohne Bundler

Aktuell lädst du 25+ JS-Dateien ohne Versionierung. Die `?v=3`-Strings sind aufwendig zu pflegen, und `index.html` lädt sieben Skripte einzeln. Bei jedem Reload sind das sieben Roundtrips.

Ich würde einen **einzigen kleinen Node-Build-Schritt** einführen (kein Bundler, keine Abhängigkeit):
- `tools/build.js` liest alle Skripte aus einer `manifest.json`.
- Es konkateniert sie zu `public/dist/bundle.js`.
- Es schreibt einen Hash in den Dateinamen: `bundle.a3f9.js`.
- `index.html` referenziert nur noch diese eine Datei.
- Bei Änderungen im Entwicklungsmodus wird das Bundle bei jedem Start neu gebaut.

Das ist kein Webpack. Es ist 80 Zeilen Node. Der Gewinn: eine Anfrage statt sieben, automatische Cache-Invalidierung, und du kannst `?v=` aus allen HTML-Dateien entfernen.

### 2.4 Tests: Coverage statt Checkliste

Du hast 25 Testdateien. Das ist stark. Was fehlt, ist eine **Coverage-Messung** und ein **Integrationstest pro Endpunkt**. Ich würde:
- `node --experimental-test-coverage` in `npm test` aktivieren.
- Eine `test/endpoints.test.js` schreiben, die **jede** Route einmal aufruft und auf Status + Form prüft. Keine Logik, nur „antwortet".
- Die Test-Ausgabe in `data/test-results/` archivieren.

Der Nutzen: Wenn du eine Route umbenennst und vergisst, sie irgendwo zu aktualisieren, krachst du beim CI. Aktuell krachst du, wenn ein Spieler am Tisch auf einen Knopf drückt. Später ist besser.

---

## 3. Der Tisch: Wie sich das Spielen anfühlen sollte

Das ist der wichtigste Abschnitt. Alles andere dient diesem.

### 3.1 Der Log ist das Herz, nicht der Boden

Aktuell ist `session.log` ein Array von Einträgen. Er wird angezeigt, aber er ist nicht *das Artefakt*. In einem PbtA-artigen Spiel wie Daggerheart ist der Log die Chronik. Er ist das, was du in fünf Jahren liest.

Ich würde den Log zur ersten Bürger-Klasse machen:

- **Sitzungs-Recap automatisch.** Am Ende jeder Session generiert der Server eine `recap.md`: „Letztes Mal: Die Gruppe traf X, entdeckte Y, Fear stieg auf 5. Zwei kritische Erfolge, ein Patzer. Offene Fäden: Z, W."
- **Der Recap ist auf der Startseite sichtbar.** Ein kleiner Block: „Letzte Session: 11.10. — 3 Stunden, 14 Würfe, Fear 4." Der SL kann ihn morgens lesen, um sich vorzubereiten.
- **Der Log ist exportierbar.** Als Markdown, als PDF, als reine Textdatei. „Kampagnen-Chronik" als Knopf.
- **Der Log ist filterbar über Sessions hinweg.** „Zeig mir alle Würfe von Charakter X." „Zeig mir jeden Fear-Anstieg." Das ist ein Recherche-Werkzeug für den SL.

Und dann: **Der Log ist einsehbar für Spieler.** Aktuell sieht der Spieler nur den Roll-Log. Was, wenn es einen `/player/story`-Tab gäbe, der die Session-Chronik zeigt — aus Sicht seines Charakters, gefiltert nachdem, was er wissen darf?

### 3.2 Fear und Hope sichtbar machen

Daggerheart ist ein Spiel über zwei Kräfte. Fear und Hope sind der Motor. Bei Ember sind sie Zahlen in einem Panel. Das ist untertrieben.

Ich würde sie **physisch machen**:
- Eine große Fear-Anzeige auf der Spieler-Ansicht. Wenn Fear steigt, pulsiert sie rot.
- Eine Hope-Anzeige, die wächst.
- Eine **Waage** in der Mitte: „+3 Hope, -1 Fear" in dieser Szene. Zeigt, wie die Nacht läuft.
- Ein Sound, wenn Fear einen Schwellenwert überschreitet (5, 8, 12). Ein tiefes Grollen.

Und für den SL: ein **Fear-Protokoll**, das aufzeichnet, wann Fear ausgegeben wurde und wofür. Nicht als Pflicht, sondern als Selbstbeobachtung. Nach der Session siehst du: „Ich habe diese Nacht 8 Fear ausgegeben, 5 davon in der ersten Stunde. Zwei Encounter waren zu leicht."

### 3.3 Initiative, die Daggerheart ist

Daggerheart hat keine klassische Initiative. Es gibt den **Spotlight**. Du kannst ihn weitergeben oder er wird dir genommen. Bei Ember ist der Spotlight ein Index in einem Array. Das funktioniert, aber es fühlt sich wie D&D-Initiative an.

Ich würde:
- Den Spotlight **visuell** machen: Ein Lichtkegel-Widget, das über dem aktuellen Charakter schwebt.
- „Spotlight geben" als Knopf pro Charakter in der UI. Nicht nur „next".
- Der SL sieht, **wer zuletzt dran war** und wie lange.
- Auto-Spotlight-Regeln konfigurierbar: „Nach jedem Wurf geht der Spotlight an den SL, außer Critical."

Kleines Detail, riesige Wirkung. Wenn der Spieler fühlt, dass der Spotlight zu ihm wandert, statt „Index +1" in einem State zu sein, spielt er anders.

### 3.4 Die Karte als Bühne, nicht als Tafel

Aktuell ist die Karte ein Rechteck mit Tokens und Fog-of-War. Das ist solide, aber es könnte viel mehr sein.

Ideen:
- **Wetter und Tageszeit.** Ein kleines Overlay: „Nacht, Vollmond" oder „Dämmerung, Regen". Der SL wählt es, die Spieler sehen es.
- **Szenen-Bilder.** Der SL kann eine Szene als Bild hochladen (z. B. „Lagerfeuer", „Krypta"), die über der Karte liegt, solange sie aktiv ist.
- **NPC-Portraits.** Ein NPC-Token kann ein Bild haben und einen Namen zeigen. Wenn der SL ihn anklickt, öffnet sich ein kleines Panel mit Motiven und Zitaten.
- **Sound-Layer pro Karte.** Eine Karte hat einen Klang: „Wald bei Nacht" (Eulen, Wind), „Krypta" (Tropfen, Hall). Wenn der SL die Karte wechselt, wechselt der Klang.
- **Karten-Notizen.** Ein Marker kann eine lange Notiz haben, die nur der SL sieht. Aktuell gibt es `label` und `note`, aber keine strukturierte Notiz-Ansicht.

### 3.5 Handouts, die ankommen

Aktuell sind Handouts Textfelder, die an einzelne Spieler gehen. Funktioniert. Aber „Handout" in einem modernen Sinn ist mehr:
- Ein Handout kann ein **Bild** sein (eine alte Karte, ein Brief).
- Ein Handout kann einen **Sound** haben (eine Stimme, ein Musikstück).
- Ein Handout kann **geheim** sein, aber einen Hinweis enthalten: „Du erkennst das Siegel — es ist das Zeichen der Krone."

Ich würde Handouts zu einem kleinen **Asset-System** machen: Der SL zieht ein Bild in die Handout-Karte, schreibt Text, wählt Empfänger, drückt „Senden". Beim Spieler öffnet sich eine Karte, die er wegklicken kann.

---

## 4. Der Spielleiter: Werkzeuge, die Denken abnehmen

Der SL ist der Nutzer mit dem höchsten kognitiven Load. Jede Erleichterung zählt.

### 4.1 Der Encounter-Rechner

Daggerheart hat ein Punktesystem: `3 × Anzahl SCs + 2` Battle Points, mit Modifikatoren. Der SL rechnet das heute im Kopf. Ember könnte es **automatisch**:
- Der SL zieht Adversaries aus dem Kompendium in eine Liste.
- Ember zeigt: „Aktuell: 14 von 17 BP. Zu leicht. Ein Minion mehr?"
- Der SL sieht die geschätzten Schwellen (Major/Severe), die HP-Summe, den erwarteten Schaden.

Das ist kein Autopilot. Es ist ein Rechenschieber. Der SL entscheidet weiterhin, aber er muss nicht nachschlagen.

### 4.2 Ein NPC-Builder

Wenn der SL einen NSC improvisieren muss, braucht er in 10 Sekunden:
- Name, Rolle, Motiv
- 2–3 Fear-Features
- Ein Zitat

Ember könnte einen kleinen Generator haben, der aus einem Pool von Namen/Motiven/Zitaten zieht. Nicht KI, nur **Zufallstabellen**. Daggerheart gibt genau das her.

### 4.3 Die Session-Vorbereitung

Ein neuer Reiter: `/prepare`. Der SL:
- Wählt eine Kampagne.
- Sieht den letzten Recap.
- Zieht Beats (Story Beats aus dem SRD) als Karten.
- Plant 3 Szenen, die als kleine Karten erscheinen.

Während der Session sieht er diese Karten in einem Panel und kann sie abhaken. Am Ende werden sie in den Log übernommen.

Das ist Nah an „Prep als Kanban". Für einen SL, der einmal pro Woche spielt, ist das eine 10-Minuten-Routine, die viel Struktur gibt.

### 4.4 Der „Was jetzt?"-Knopf

Manchmal sitzt der SL am Tisch und weiß nicht weiter. Ich würde einen einzigen Knopf einbauen: „Was jetzt?"

Er zieht aus drei Tabellen:
- **GM Moves** (aus dem SRD): „Zeig die Spuren eines nahenden Feindes.", „Lass die Umgebung sich verändern.", „Zwinge eine Wahl."
- **Fragen an die Spieler**: „Was siehst du, das die anderen nicht sehen?", „Was tut dein Charakter jetzt?"
- **Consequences** basierend auf dem letzten Wurf.

Kein Generator, der eine Story baut. Ein **Impuls**. Wenn der SL ihn nicht nutzt, kein Verlust.

### 4.5 Die Sessionuhr

Ein sanftes Widget, das zeigt, wie lange die Session läuft, wie oft der SL dran war, wie oft die Spieler. Rein als Feedback für den SL: „Du hast in der letzten halben Stunde dreimal so viel geredet wie die Spieler." Wer sich dafür interessiert, lernt daraus.

### 4.6 Der Undo

Aktuell gibt es Undo für Token-Moves und Rolls. Ich würde es **global** machen: Jede Aktion, die State verändert, landet in einem Undo-Stack. Strg+Z nimmt die letzte zurück. Bis zu 50 Schritte.

Der Gewinn ist enorm: Der SL kann herumprobieren, ohne Angst zu haben.

---

## 5. Die Spieler: Was sie fühlen sollen

Die Spieler-Ansicht ist aktuell eine Sammlung von Panels. Sie funktioniert. Aber sie fühlt sich nicht wie ein Charakter an.

### 5.1 Die Bogen-Ansicht als Zuhause

Der Bogen ist das Erste, was der Spieler sieht. Ich würde ihn **ruhiger** machen:
- Große Hope-Anzeige, große HP, große Stress. Nicht nur Zahlen, sondern ein Gefühl.
- Die Domain-Karten (sobald es sie gibt) als kleine Kacheln, wischbar.
- Experiences als Chips, klickbar zum Aktivieren.
- Connections als Liste: „Wer ist mir wichtig, wer schuldet mir was."

Die aktuelle Ansicht ist funktional. Aber ein Charakter ist mehr als sechs Zahlen und drei Pips.

### 5.2 Der „Was kann ich?"-Modus

Der Spieler weiß nicht immer, was er tun kann. Ein Modus, in dem alle Optionen sichtbar sind: „Wenn du mutig sein willst: X. Wenn du schlau sein willst: Y. Wenn du den Verbündeten retten willst: Z."

Das sind keine Regeln, das sind **Stichwörter**. Der Spieler beschreibt, was er tut, und wählt dann die passende Probe. Aktuell wählt er aus einem Dropdown. Das ist umgekehrt.

### 5.3 Der Story-Feed

Statt nur den Roll-Log zu sehen, hätte der Spieler einen **Story-Feed**:
- Was in der Szene passiert ist, in drei Sätzen.
- Was sein Charakter gesehen hat.
- Wer gerade Spotlight hat.
- Was auf ihn wartet (falls der SL das vorbereitet hat).

Das ist der Unterschied zwischen „Ich schaue auf meinen Bogen" und „Ich bin in der Geschichte".

### 5.4 Verbindungen zu anderen Spielern

Daggerheart hat Connections als mechanisches Element. Ein kleiner Bereich: „Was weiß ich über die anderen?" Klick auf einen Charakter, siehst du: seinen Namen, seine Klasse, seine Connections. Der SL kann das steuern.

### 5.5 Ein „Würfel-Simulator" mit Gefühl

Der Spieler tippt Hope und Fear ein und drückt „Würfeln". Das ist schnell, aber nicht *schön*. Ich würde das Wurf-Ergebnis als **Moment** inszenieren:
- Kurze Animation der beiden Würfel.
- Sound: Bei Hope heller Ton, bei Fear dumpfer.
- Der Text „Success with Hope" groß und in Farbe.

Das ist eine Sekunde mehr, aber sie macht die Session rhythmischer. Jeder Wurf wird ein kleiner Beat.

### 5.6 Offline-Blatt

Der Spieler hat im Zug keinen Empfang. Warum kann er nicht seinen Bogen sehen und offline bearbeiten?
Ich würde einen **kleinen Service Worker** einbauen (keine Abhängigkeit, ~100 Zeilen), der:
- Die Bogen-Seite cacht.
- Änderungen lokal speichert.
- Beim Wiederverbinden synchronisiert.

Daggerheart hat Downtime-Moves. Ein Spieler, der während der Woche eine Rast macht, kann das offline tun.

---

## 6. Das Ereignis-System (Spur): Die größte Chance

Das ist meiner Meinung nach **die** einzigartige Sache an Ember. Kein anderes Daggerheart-Tool hat Mikrospiele, die in den Tisch-State einzahlen. Das ist deine Krone.

Aber aktuell ist es dünn. Ein Event ist:
- Titel, Stake, Payout.
- Spieler spielen ein Microgame (Puls, Fallwerk, etc.).
- Am Ende: eine Zahl. Hope oder Fear.

Was es sein könnte:

### 6.1 Der Spur-Layer als Momentum

Der SL wirft ein Event, und die Tisch-Stimmung ändert sich sichtbar. Ich würde einen **Momentum-Balken** einführen:
- Zeigt, wie die letzten 5 Ereignisse ausgingen.
- Grün = die Gruppe hat gewonnen. Rot = verloren.
- Kippt bei jedem Ereignis.

Nach zehn Ereignissen sieht der Tisch: „Wir sind auf dem Vormarsch" oder „Wir verlieren Boden." Das ist narrativ, sichtbar, und kostenlos.

### 6.2 Ereignisse mit Kontext

Aktuell ist ein Ereignis isoliert. Es hat keinen Bezug zum Rest. Ich würde **Ereignis-Serien** bauen:
- Ein Ereignis kann das nächste **freischalten**.
- Der Ausgang bestimmt, was danach kommt: „Wenn die Gruppe X gewinnt, geht es zu Y."
- Der SL kann einen **Baum** vorbereiten.

Das macht Ereignisse zu **Kampagnen-Momenten**, nicht nur zu Zwischenspielen.

### 6.3 Der Ergebnis-Zustand

Ein Event endet heute mit „+1 Hope". Ich würde es reicher machen:
- Der SL definiert **vor** dem Event: „Bei Sieg: die Brücke hält, die Gruppe kann weiter. Bei Niederlage: die Brücke bricht, ein Umweg kostet Zeit."
- Die Spieler wissen, was auf dem Spiel steht.
- Nach dem Event: Der Text wird in den Log übernommen.

Der Effekt ist: Ereignisse werden **echte Szenen**. Nicht „Wir spielen kurz Fallwerk", sondern „Die Brücke hält nur, wenn wir Fallwerk gewinnen."

### 6.4 Ereignisse als Rituale

Wenn eine Gruppe regelmäßig spielt, hat sie Rituale. „Erst wird gegessen, dann ein Fallwerk zur Aufwärmung." Ember könnte ein **Ritual**-Konzept haben: der SL wählt „Dienstags-Ritual" und es werden 2 Ereignisse vorgeschlagen. Kein Zufall — eine gespeicherte Vorlage.

### 6.5 Microgames konsolidieren

Hier wird es unangenehm: Du hast fünf Microgames (Runner, Fallwerk, Pastellpfad, Scharfschuss, Puls). Jedes ist ein eigenes Modul mit eigener Balance, eigenem UI, eigenem Draw-Code. Das sind zusammen ~5000 Zeilen.

Ich würde **zwei behalten und drei entfernen.** Meine Wahl:
- **Puls** behalten — es ist das einzige „soziale" Spiel, das alle gleichzeitig einbezieht. Sehr wertvoll.
- **Fallwerk** behalten — es ist schnell, entspannend, hat Physik.
- **Runner** entfernen — es ist ein klassischer Endless Runner, mechanisch dünn.
- **Pastellpfad** entfernen — es ist beeindruckend, aber es fesselt den Tisch lange, und es ist am schwersten zu pflegen.
- **Scharfschuss** entfernen — Tower Defense ist gut, aber es dauert 10+ Minuten und ist komplex.

**Achtung:** Das ist *meine* Wahl. Du hast diese Spiele aus einem Grund gebaut. Vielleicht ist Runner dein Ding. Die Entscheidung darf nicht ich treffen. Aber die Empfehlung ist: **Weniger ist mehr.** Jedes Microgame ist ein Kind, das Aufmerksamkeit braucht. Zwei gute sind besser als fünf halbgute.

Wenn du alle behalten willst: **Konsolidiere sie technisch.** Ein gemeinsames `spur-bar.js` (hast du), eine gemeinsame `event-config.json` (fehlt), ein gemeinsames `reportScore()`. Der UI-Code bleibt verschieden, aber die Anbindung an den Tisch wird einheitlich.

### 6.6 Der „Spur-Editor"

Ein neuer Reiter: `/spur`. Der SL baut ein Event:
- Titel, Stake, Payout-Typ (Hope/Fear/beides/Text).
- Dauer.
- Anzahl der Spieler.
- **Erzählung**: Was ist die Fiktion?
- **Bedingung**: Was muss passieren?

Der Editor speichert in `campaign.spurs`. Am Tisch: Ein Knopf „Ereignis starten", die Spieler kriegen es auf den Schirm, am Ende wird der Score zurückgemeldet und in den Log geschrieben.

---

## 7. Solo: Die zweite große Chance

Solo ist aktuell eine nette Idee: Ein Held, ein Dungeon, sieben Räume. Aber es fühlt sich nicht wie Daggerheart an. Der Held hat keine Domain-Karten, keine Connections, keine Downtime-Moves, keine *Charakterentwicklung* im erzählerischen Sinn.

Daggerheart ist ein Erzählspiel. Ein Solo-Modus müsste auch erzählen.

### 7.1 Solo als Journaling

Was, wenn der Solo-Modus mehr wäre als Kämpfe? Der Held zieht los. Unterwegs fragt Ember ihn: „Was war dein schlimmster Moment als Kind?" Der Spieler tippt eine Antwort. Die Antwort wird zu einer Experience mit Bonus. Das ist Charaktererschaffung *in* der Handlung.

Daggerheart hat Background Questions. Der Solo-Modus könnte sie **als Spielmechanik** nutzen:
- Der Held kommt an eine Tür.
- Eine Frage erscheint: „Warum hast du die Gilde verlassen?"
- Der Spieler antwortet (Textfeld).
- Der Held bekommt eine Erfahrung: „Gildenverstoßener +2".
- Die Tür öffnet sich.

Das ist ein Solo-Journaling-Spiel im Daggerheart-Gewand. Und es würde viel besser passen als die aktuelle Dungeon-Variante.

### 7.2 Solo als Trainings-Tool

Eine zweite Richtung: Solo als **Regel-Training**. Der Spieler spielt einen Kampf gegen einen einzelnen Gegner, und Ember erklärt jeden Schritt: „Das war ein Success with Fear. Der SL (also du) bekommt einen Fear. Bei Fear 5 kannst du einen Foe-Zug machen."

Das ist ein Lehrbuch, kein Spiel. Aber für Einsteiger Gold.

### 7.3 Solo als Kampagnen-Vorbereitung

Der SL kann einen Solo-Lauf machen, um einen Encounter zu testen: „Wie stark ist mein Boss?" Der Lauf wird nicht gespeichert. Nur die Statistik. Das ist ein kleines Feature mit viel Nutzen.

### 7.4 Mein Vorschlag

Ich würde den Solo-Modus **in zwei Modi aufteilen**:
- **Training** (aktuell) — der Dungeon.
- **Journal** — die erzählende Variante mit Fragen und Charakterentwicklung.

Der zweite ist der wichtigere, weil er Daggerheart *ist*.

---

## 8. Regeln und Kompendium

### 8.1 Domain-Karten als Daten

Daggerheart ist kartengesteuert. Jeder Charakter hat Domain-Karten. Aktuell hast du die SRD-Einträge als Text, aber nicht als **Karten**. Das ist eine Lücke.

Ich würde eine `data/domain-cards.json` bauen. Jede Karte:
- Name, Domain, Level
- Recall Cost
- Text
- Feature-Typ (Spell, Ability, Grimoire)
- Klassenzugang

Dann kann der Charakter-Bogen **echte Karten** zeigen. Der Spieler wählt beim Level-Up aus einem Kartendeck. Das ist Daggerheart.

### 8.2 Karten als Bilder

Der SRD hat keine Bilder, aber es gibt Community-Ressourcen. Wenn du willst, kannst du eigene Karten als SVG bauen — mit dem gleichen Rahmen wie deine Sprites. Sieben Karten pro Domain, zehn Domains, 70 SVGs. Das ist viel Arbeit, aber es ist das, was Daggerheart ausmacht.

### 8.3 Subklassen und Klassenfähigkeiten

Die Subklassen sind in `solo.js` als Text. Sie sollten in einer eigenen Datei sein. Und sie sollten auf dem Charakter-Bogen erscheinen, mit ihren Features, mit Tier-Anzeige.

### 8.4 Adversaries und Environments

Du hast sie als SRD-Einträge. Ich würde sie als **stat blocks** strukturieren:
- Name, Tier, Type, Difficulty
- HP, Stress
- Attack, Damage
- Motives & Tactics
- Features (Action, Reaction, Passive, Fear)
- Environments: Impulses, Potential Adversaries, Feature Questions

Der SL kann sie dann aus einer Liste ziehen, in einen Encounter werfen, und Ember rechnet die Battle Points.

### 8.5 Regel-Nachschlagen im Kontext

Wenn ein Spieler „Success with Fear" rollt, sollte er einen Tooltip bekommen: „Das bedeutet: Du beschreibst den Erfolg. Der SL bekommt einen Fear und macht einen GM Move." Aktuell gibt es das Kompendium, aber es ist nicht mit dem Wurf verlinkt.

### 8.6 Ein Regel-Lern-Modus

Für Anfänger: Ein Schalter, der nach jedem Wurf erklärt, was gerade passiert. Nach drei Sessions schaltet man ihn ab.

---

## 9. Klang und Atmosphäre

Das ist das, was Ember am meisten fehlt.

### 9.1 Ambient-Sounds

Ein Daggerheart-Spiel spielt am Lagerfeuer, im Dunkeln. Klang ist Stimmung. Ich würde einen Ambient-Layer einbauen:
- **Feuer** (Standard). Knistert leise.
- **Wald bei Nacht** (Eulen, Wind).
- **Krypta** (Tropfen, Hall).
- **Sturm** (Wind, Regen).
- **Stille** (nichts, wenn der SL das will).

Der SL wählt pro Szene einen Sound. Der Sound wechselt sanft über 2 Sekunden.

Das ist ein 200-Zeilen-Feature. Der Effekt ist enorm.

### 9.2 Musik

Ambient ist eins. Musik ist ein anderes. Für Kämpfe, für Rituale, für Szenen. Ich würde keine Musik *mitliefern* (Lizenz!), aber einen Hook anbieten: Der SL kann eine MP3 in `data/music/` legen und im UI einen Track auswählen. Die Spieler hören sie über den Server.

### 9.3 Stimmaufnahmen

Jeder NSC kann eine kurze Audio-Datei haben. Der SL spricht einen Satz ein, die Spieler hören ihn, wenn der NSC spricht. Das ist Podcast-Aufwand, aber es würde das Spiel verwandeln.

### 9.4 Sound-Design für Würfe

Der Wurf ist der wichtigste Moment. Ich würde einen echten, tiefen Sound bauen — nicht nur einen Ton, sondern einen kurzen Klang (Sand, Holz, Metall). Bei Hope anders als bei Fear. Das ist teuer in der Produktion, aber es zahlt sich bei jedem Wurf aus.

### 9.5 Die „Stille"

Und dann: Momente der Stille. Wenn die Gruppe einen kritischen Fehlschlag hat, wird der Ambient-Sound für 3 Sekunden leiser. Nur das Atmen. Ein Beat. Dann weiter.

---

## 10. Daten und Betrieb

### 10.1 Backups, die man anfassen kann

Aktuell: `data/ember.json.bak`. Ich würde es reicher machen:
- Ein Backup pro Tag, mit Datum im Namen (`backup-2026-10-11.json`).
- Die letzten 30 bleiben.
- Ein UI-Knopf „Backups ansehen". Zeigt eine Liste mit Zeitstempeln.
- Klick auf ein Backup: Vorschau (wie viele Charaktere, welche Session), dann „Wiederherstellen".

Damit kannst du den gestrigen Spielabend zurückholen, wenn du heute die Kampagne zerlegst.

### 10.2 Das Log rotieren

`data/crash.log` wächst unbegrenzt. Ich würde:
- Bei 1 MB rotieren: `crash.log` → `crash.log.1`.
- Nur die letzten 5 behalten.

### 10.3 Ein „Health-Check"-Endpoint

`/api/health` gibt eine kurze Übersicht: Speicher, letzter Schreibvorgang, Anzahl Clients, aktive Session, Warteschlangen-Länge. Für Monitoring, aber auch für Debugging: „Warum fühlt sich der Server langsam an?"

### 10.4 Export der Kampagne

Ein Knopf „Kampagne exportieren" gibt eine ZIP-Datei:
- `campaign.json` (State)
- `sessions/` (Logs)
- `characters/` (Bögen)
- `images/` (Karten, Handouts)
- `recap.md` (generierte Chronik)

Damit kannst du deine Kampagne sichern oder auf einen anderen Rechner übertragen.

### 10.5 Der „Umzug"

Und eine zweite Richtung: `campaign.zip` importieren. Auf einem anderen Rechner, in einer anderen Runde, unter einem anderen SL-Namen. Die Kampagne zieht um.

### 10.6 Windows-Installer?

Ich würde keinen Installer bauen. Der ZIP-Download + `start.bat` ist gut. Aber ich würde:
- Einen `check.bat` hinzufügen, der prüft, ob Node installiert ist, ob Port 3478 frei ist, ob die Datei `data/` schreibbar ist.
- Eine `stop.bat`, die einen laufenden Server beendet (falls `start.bat` in einem Fenster hängt).

### 10.7 Firewall-Regeln automatisieren

`start.bat` könnte die Windows-Firewall-Regel für Port 3478 anlegen, falls sie fehlt (`netsh advfirewall firewall add rule`). Das ist ein 5-Zeiler, der die Ersteinrichtung massiv erleichtert.

---

## 11. Was ich entfernen würde

Ich habe viel vorgeschlagen. Jetzt das Gegenteil: Was würde ich **rausnehmen**? Auch hier klar und begründet.

### 11.1 Die Home-Desk-Drag-Oberfläche

Die Kacheln auf `/` sind verschiebbar. Das ist ein nettes Feature, aber es kostet:
- 400 Zeilen `home-desk.js`.
- Ein `localStorage`-Schema, das ständig migriert werden muss.
- Nutzerverwirrung, wenn Kacheln plötzlich woanders sind.

Ich würde eine **festes Raster mit Kategorien** einbauen:
- **Tisch** (Ember, Karte, Session, Handouts)
- **Charaktere** (Bögen, Level-Up)
- **Welt** (Bibliothek, Karten, Kompendium)
- **Werkzeuge** (Testlauf, Einstellungen, Server)

Klick auf Kategorie → zeigt die Kacheln. Wer will, kann ein- und ausklappen. Drag-and-Drop nur, wenn er es explizit einschaltet.

### 11.2 `settings-panel.js` (die schwebende Zahnrad-Ecke)

Überlappt mit den Einstellungen in `home-desk.js`. Ich würde es entfernen und die Einstellungen an einer Stelle zentralisieren.

### 11.3 Die Testlauf-Seite als Teil des Spiels

`testlauf.html` ist ein QA-Werkzeug. Es lebt im Spiel, aber es ist nicht *Spiel*. Ich würde es als eigenes kleines Tool bauen (`tools/testlauf.html`), das nur lokal läuft und nicht in der `/`-Kachel-Übersicht auftaucht. Der Aufwand: 30 Minuten Umzug. Der Gewinn: Der Tisch sieht beim Start nicht „Testlauf" und denkt nicht, das sei eine Spielseite.

### 11.4 Der GitHub-Upload

`testlauf-upload.js` schiebt Testläufe auf einen Branch. Das ist CI-Infrastruktur im Spiel. Ich würde es behalten, aber aus dem `/`-Menü rausnehmen. Es sollte nur in `/testlauf` auftauchen (macht es schon) und nicht als Feature beworben werden.

### 11.5 Zwei der fünf Microgames

Siehe Abschnitt 6.5. Ich würde Runner, Pastellpfad und Scharfschuss entfernen, Puls und Fallwerk behalten.

**Nochmal betont:** Das ist meine Wahl. Du kennst deine Runde. Vielleicht liebt sie Scharfschuss. Dann behalte es und streiche etwas anderes. Aber **reduziere die Anzahl**.

### 11.6 Die `chats`-Funktion

`/api/chats` liest Markdown-Dateien aus `docs/chats/`. Das ist ein Anhang aus einer früheren Zeit. Wenn es genutzt wird, okay. Wenn nicht, raus. Ich habe es nirgends prominent gesehen.

### 11.7 Die `pixelstube` UND das `tokenatelier`

Zwei Pixel-Editoren. Beide machen fast dasselbe. Ich würde **einen** behalten — den, der auf den Charakterbogen schreibt (Tokenatelier). `pixelstube` ist ein freier Editor ohne Anbindung. Wenn du ihn zum Malen von Szenenbildern nutzt, behalte ihn. Sonst raus.

### 11.8 Die `heft`-Notizen

„In diesem Browser gespeichert." Das ist eine Insel. Kein Export, keine Synchronisation, kein Server-Backup. Wenn ein Spieler die Notizen eines Abends verliert, ist es weg. Ich würde entweder:
- Es an den Server anbinden (Sync mit `ember.json`).
- Oder es klar als „persönliches Notizbuch" markieren, mit Export-Knopf.

Der aktuelle Zustand ist zu wackelig für den Wert, den es hätte.

### 11.9 Die Solo-Werkstatt als eigene Seite

`/solo/werkstatt` ist eine Debug-Oberfläche. Der Nutzer kann Subklassen setzen, Bots spawnen, Karten malen. Es ist nützlich beim Entwickeln, aber es ist nicht Spiel. Ich würde es hinter einem „Entwickler"-Schalter verstecken (URL-Parameter `?dev=1` oder so).

---

## 12. Was ich niemals anfassen würde

Bevor ich zum Traum komme, eine Liste von Dingen, die ich **nicht** ändere:

1. **Der `data/`-Ordner ist gitignored.** Nie anders.
2. **Keine Cloud.** Kein Login, kein Sync, kein Server bei jemand anderem.
3. **Der `start.bat`-Doppelklick muss funktionieren.** Keine „npm install"-Schritte, keine Konfigurationsdatei.
4. **Der Cloudflare-Tunnel ist optional.** Ohne Tunnel geht alles im LAN.
5. **Die Spieler-URL bleibt `/player`.** Keine Unterrouten, keine Query-Parameter-Pflicht.
6. **Das Design bleibt dunkel.** Kein Light Mode, weil Daggerheart ein Spiel der Nacht ist.
7. **Die Sprites bleiben Pixel.** Kein Vektor-Update, keine 3D-Modelle.
8. **Der SL-Rechner bleibt der Server.** Auch wenn die Gruppe wächst, es bleibt ein Rechner.
9. **`lib/` bleibt frei von Server-Abhängigkeiten.** Kein `require("http")` in `dice.js`.
10. **Die Changelog-Datei bleibt.** Auch wenn du git nutzt.

---

## 13. Ein Traum in fünf Jahren

Jetzt der weite Blick. Es ist 2031. Wo ist Ember?

Ich sehe drei mögliche Zukünfte, und ich sage dir, welche ich wählen würde.

### Traum A: „Der persönliche Spieltisch"

Ember ist gewachsen, aber bleibt Dave's Werkzeug. Es hat:
- Eine Kampagne, die seit fünf Jahren läuft.
- Ein Archiv mit 200 Sitzungen und einer Chronik, die man lesen kann.
- 30 Microgames, weil du einfach Freude am Bauen hast.
- Eine kleine Community von 5 anderen SLs, die ihre eigenen Varianten gebaut haben, ohne dass es eine Firma wurde.

Das ist der wahrscheinlichste Traum. Er ist ehrlich, er ist realistisch, und er ist schön.

### Traum B: „Das deutsche Daggerheart-Tool"

Ember wird bekannter. Andere deutsche Runden nutzen es. Du pflegst es nicht mehr alleine; zwei Freunde committen mit. Du baust:
- Ein Tutorial für neue SLs.
- Eine Online-Datenbank mit Community-Kampagnen.
- Einen Marktplatz für Domain-Karten-Bilder.

Dieser Traum ist verlockend. Aber er hat einen Preis: Du wirst zum Maintainer. Du kriegst Issues, PRs, Erwartungen. Das Projekt wird Arbeit. Die Null-Abhängigkeits-Regel wird schwer zu halten. Irgendwann kaufst du dir ein VPS und „nur für die Demo".

Ich würde diesen Traum **nicht** wählen. Es sei denn, du willst es wirklich.

### Traum C: „Das Daggerheart-Werkzeug für den Tisch, das nie ein Produkt wird"

Ember bleibt, was es ist. Aber es wird **tiefer**. Es hat:
- Eine Kampagne, die über Jahre läuft.
- Jede Domain-Karte als echte Karte.
- Ein Regel-Engine, das Daggerheart *versteht*.
- Einen Ambient-Soundtrack, den du selbst aufgenommen hast.
- Einen Solo-Modus, der ein kleines Journaling-Spiel ist.
- Eine Chronik-Export-Funktion, mit der du am Ende der Kampagne ein Buch drucken lassen kannst.

Nichts davon ist für andere. Alles davon ist für *deine* Runde.

Das ist der Traum, den ich wählen würde.

---

## 14. Wenn ich nur zehn Dinge tun könnte

Zum Schluss eine Priorität. Wenn ich nur zehn Dinge an Ember ändern könnte, in dieser Reihenfolge:

1. **Session-Recap automatisch generieren.** Ein Block auf der Startseite, ein Knopf am Session-Ende. Sofort spürbarer Wert.
2. **`server.js` in `routes/` aufteilen.** Nicht glamourös, aber der wichtigste Struktur-Schritt.
3. **Domain-Karten als Daten + Anzeige.** Das ist Daggerheart.
4. **Ambient-Sounds.** Ein Tag Arbeit, eine Verwandlung der Stimmung.
5. **Zwei Microgames entfernen, eines davon tiefer machen.** Fokus.
6. **NPC-Builder + Encounter-Rechner.** Der SL dankt es dir.
7. **Globales Undo (Strg+Z).** Der SL probiert aus, statt zu fürchten.
8. **Export der Kampagne als ZIP.** Damit die Kampagne ein Artefakt wird.
9. **Beziehungsgraph (Connections).** Direkt aus dem SRD, direkt auf dem Bogen.
10. **`data/history/` mit Rewind.** Nie wieder „Oh nein, gelöscht."

Diese zehn sind nicht die zehn schönsten. Es sind die zehn, die am meisten verändern.

---

## 15. Was ich **nicht** tun würde

Und eine letzte Liste, diesmal negativ. Damit du siehst, wo ich Grenzen ziehe:

- Ich würde **keine Analytics** einbauen. Kein Tracking. Kein „Diese Session war 23% effizienter". Das ist nicht deine Runde.
- Ich würde **keine Gamification** einbauen. Keine Punkte, keine Badges, keine Streaks. Daggerheart hat Hope und Fear, das reicht.
- Ich würde **kein Social-Feature** einbauen. Kein Teilen, kein Like, kein Kommentar. Ember ist ein Tisch, kein Netzwerk.
- Ich würde **kein Bezahlmodell** bauen. Kein Premium, keine Lizenz, keine Spenden-Buttons. Wenn jemand helfen will, schreibt er dir eine Mail.
- Ich würde **nichts mobiles Natives** bauen. Kein iOS-App, kein Android. Das Web reicht.
- Ich würde **nichts internationalisieren.** Die UI bleibt deutsch. Wenn jemand Englisch braucht, soll er es forken. (Sorry i dont Mean IT Mean of IT Sounds so)

---
