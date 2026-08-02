# DECISIONS – Life RPG

Kurzes Protokoll der Design- und Technik-Entscheidungen für Phase 1 (MVP).

## Stack

- **React 18 + TypeScript + Vite + Tailwind CSS 4** (via `@tailwindcss/vite`, ohne separate Config-Datei – Tailwind 4 Standard).
- **Skill-Tree-Visualisierung:** React Flow (`@xyflow/react` v12) mit eigenem, einfachem Layer-Layout (Knoten werden nach Voraussetzungs-Tiefe in Reihen angeordnet). Kein zusätzliches Layout-Framework (dagre etc.) – bei den erwarteten Baumgrößen unnötig.
- **State:** Zustand (`zustand`) als schlanker Store. Alle Daten werden beim Start einmal geladen und im Speicher gehalten; jede Mutation schreibt durch die Repository-Schicht zurück.
- **Persistenz:** IndexedDB via **Dexie**. Die App spricht ausschließlich mit dem Interface `LifeRpgRepository` (`src/data/repository.ts`) – ein späteres Backend ersetzt nur die Implementierung, nicht den Store oder die UI.
- **Routing:** `react-router-dom` mit **HashRouter**, damit die App auch von statischem Hosting ohne Server-Rewrites funktioniert.

## Level- & XP-System

- `xpForLevel(n) = round(100 * n^1.5)` = XP, um von Level *n* auf *n+1* zu kommen. Level starten bei 1, kein Cap.
- Pro Bereich wird nur die **Gesamt-XP gespeichert**; das Level wird immer daraus abgeleitet (eine Quelle der Wahrheit, kein Drift).
- **Charakter-Level = Summe der Bereichslevel.** Gewählt statt Durchschnitt, weil es sich nach RPG-Fortschritt anfühlt: jeder Bereich zahlt sichtbar aufs Gesamtlevel ein, und ein neuer Bereich senkt nie das Charakter-Level.
- XP-Quellen: Aktivitäten, Knoten abschließen, Ziele erreichen, Ressourcen abschließen (fix je Typ: Buch 100, Video 25, Kurs 150, Sonstiges 40 – nur beim ersten Wechsel auf „Fertig").
- Jede XP-Vergabe erzeugt automatisch einen Log-Eintrag – das Log ist das vollständige „Journal" des Fortschritts.

## Datenmodell

- Knoten-Status (`locked`/`available`/`completed`) wird gespeichert, aber nach jeder Änderung aus den Voraussetzungen **neu berechnet** (`recomputeNodeStatuses`). Abgeschlossene Knoten werden nie zurückgestuft, auch wenn Voraussetzungen nachträglich geändert werden.
- Voraussetzungen sind nur innerhalb desselben Bereichs wählbar (hält die Bäume unabhängig und das UI einfach). Zyklen durch manuelles Editieren werden bei der Tiefenberechnung abgefangen.
- Bereiche haben `suggestedActivities` (Label + XP) als Schnellauswahl im Aktivitäts-Formular – der einfachste Weg, „typische Aktivitäten pro Bereich" ohne extra Entität abzubilden.
- Die 5 Kernbereiche sind `isCustom: false` und nicht löschbar (aber voll editierbar); eigene Bereiche sind löschbar (mit Kaskade auf Knoten/Ziele/Ressourcen/Logs).

## UX-Entscheidungen

- **Onboarding light in Phase 1:** Beim ersten Start nur Name eingeben → 5 Kernbereiche mit Beispiel-Bäumen werden geseedet. Der volle Fragebogen mit personalisierter Baum-Generierung ist Phase 2 (so bleibt das MVP schnell benutzbar und die Bäume sind trotzdem sofort da).
- **Streak bereits im MVP:** Die Berechnung ist trivial (Tage in Folge mit ≥1 Log-Eintrag) und motiviert stark – vorgezogen aus Phase 2. Ein Streak zählt noch, wenn gestern geloggt wurde und heute noch nicht.
- Knoten im Baum sind nicht frei verschiebbar (Layout ist deterministisch aus den Voraussetzungen) – weniger Zustand, immer aufgeräumt.
- Level-Up-Feedback: Vollbild-Overlay in Bereichsfarbe + „+X XP"-Toast bei jeder XP-Vergabe, auto-dismiss nach ~3 s.
- Gesundheit: Seed-Inhalte bewusst auf Konsistenz und Wohlbefinden ausgerichtet (keine Gewichts-/Kalorienziele). Finanzen: Seed-Inhalte sind Tracking-Meilensteine, keine Anlageempfehlungen.

## Phase 2

### Onboarding-Fragebogen & generierter Start-Baum

- Ablauf: Name → Bereichsauswahl → pro gewähltem Bereich eine Seite mit drei Fragen (Erfahrungsstand, Fokus-Tags als Mehrfachauswahl, optionales Freitext-Ziel).
- **Bereiche sind abwählbar.** Die 5 Kernbereiche sind vorausgewählt, aber wer keine Finanzen tracken will, bekommt sie auch nicht – Individualisierung schlägt Vollständigkeit.
- **Generator statt fixem Seed** (`src/data/onboarding.ts`): Jeder Bereich hat einen Pool von Knoten-Templates mit `stage` (0 = Grundlage … 3 = Meisterschaft) und optionalem `requiresTag`. Tag-gebundene Templates landen nur im Baum, wenn der passende Fokus gewählt wurde – dadurch bekommt jede Person einen anderen Baum. Templates sind rein deklarativ, damit Phase 3 sie später durch KI-generierte Knoten ersetzen kann, ohne die Generator-Logik anzufassen.
- Prerequisites in Templates sind lokale Keys; beim Generieren werden echte ids vergeben und Verweise auf herausgefilterte Templates entfernt. So bleibt der Baum immer konsistent.
- **Erfahrungsstand wird als bereits erledigter Fortschritt abgebildet:** Knoten unterhalb des angegebenen Stands starten `completed`, ihre XP zählen als Start-XP, und pro Bereich wird ein Log-Eintrag „Bestehender Fortschritt aus dem Onboarding" geschrieben. Wer sagt „ich trainiere regelmäßig", startet in Gesundheit also nicht bei Level 1. Alternative wäre gewesen, frühe Knoten wegzulassen – dann fehlt aber die sichtbare Historie im Baum.
- Freitext-Ziele werden direkt als `Goal` angelegt (Größenklasse „mittel“).

### Achievements / Badges

- 21 Abzeichen in drei Stufen (Bronze/Silber/Gold), definiert als reine Prädikate über einen `AchievementContext` (`src/lib/achievements.ts`). Keine Persistenz der Bedingungen – nur `{ id, unlockedAt }` wird gespeichert, alles andere wird zur Laufzeit ausgewertet. Neue Abzeichen lassen sich so ergänzen und greifen rückwirkend.
- Auswertung läuft nach jeder Mutation über den ganzen State (21 Prädikate über In-Memory-Arrays, vernachlässigbar). Kein inkrementelles Tracking – das wäre fehleranfällig ohne messbaren Gewinn.
- Gesperrte Abzeichen zeigen einen Fortschrittsbalken (`progress()`), damit sie motivieren statt nur zu verstecken.
- Freischalt-Feedback als Toast (oben rechts am Desktop, oben mittig am Handy), Warteschlange bei mehreren gleichzeitigen Unlocks.

### Ressourcen-Bibliothek

- Eigener Screen `/library` mit allen Ressourcen bereichsübergreifend, plus Filter nach Bereich/Typ/Status und Titelsuche.
- Ressourcen-Formular und -Zeile wurden in gemeinsame Komponenten extrahiert (`ResourceFormModal`, `ResourceRow`), die Bereichs-Tab und Bibliothek teilen. Im Bibliotheks-Kontext kommt eine Bereichsauswahl dazu.
- Navigation: Kopfzeile am Desktop, feste Tab-Leiste unten am Handy.

### Datenbank-Migration

- Dexie `version(2)` ergänzt nur die Tabelle `achievements`; bestehende Tabellen bleiben unangetastet, vorhandene Spielstände laufen ohne Datenverlust weiter.

## Phase 3

### Backend: Supabase

- **Warum Supabase:** deckt beide Hälften von Phase 3 mit einem Dienst ab — Auth (Konten) und Postgres (Sync) — und über Edge Functions zusätzlich einen serverseitigen Ort für den Anthropic-Schlüssel. Kostenloser Tarif reicht. Das Frontend bleibt eine statische Seite auf GitHub Pages.
- **Cloud ist optional.** Ohne `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` läuft die App unverändert lokal, und die gesamte Cloud-UI (Anmelden-Knopf, KI-Vorschläge) ist ausgeblendet. Ein fehlendes oder nicht erreichbares Backend ist nie ein harter Fehler — bei Verbindungsproblemen fällt die App auf den lokalen Speicher zurück.
- **Repository-Umschaltung:** Nicht angemeldet → Dexie, angemeldet → Cloud. Beide implementieren dieselbe `LifeRpgRepository`-Schnittstelle aus Phase 1; `repository` ist eine Fassade, die an das aktive Backend delegiert. *(Nachträglich verfeinert: im angemeldeten Zustand steht heute `SyncingRepository` dazwischen, siehe „Offline-Betrieb & Installierbarkeit" — ursprünglich schrieb die App dort direkt in die Cloud und brauchte dafür eine Verbindung.)*
- **Erstanmeldung überträgt lokale Daten.** Ist in der Cloud noch kein Profil, wird der lokale Spielstand einmalig hochgeladen — niemand verliert durch das Anlegen eines Kontos seinen Fortschritt.
- **Schema:** eine Tabelle pro Entität, Primärschlüssel `(user_id, id)`, weil ids weiterhin clientseitig erzeugt werden. Row Level Security mit `auth.uid() = user_id` auf jeder Tabelle ist die eigentliche Absicherung — deshalb ist der `anon`-Key gefahrlos im Browser.
- Beim Löschen eines Bereichs räumt der Cloud-Repository die abhängigen Zeilen explizit auf (kein FK-Cascade zwischen den Tabellen, da Bereichs-ids Text und nicht global eindeutig sind).

### KI-Personalisierung

- **Der Anthropic-Schlüssel liegt ausschließlich in der Edge Function** (`supabase/functions/suggest-nodes`), nie im Browser-Bundle. Die App ist eine statische Seite — alles, was ins Bundle wandert, wäre öffentlich lesbar. Supabase prüft vor dem Funktionsaufruf das JWT, also erreichen nur angemeldete Nutzer die Funktion.
- **Strukturierte Ausgabe** (`output_config.format` mit JSON-Schema) statt Freitext-Parsing: die Antwort ist dadurch garantiert schemakonform, kein Nachparsen von Markdown.
- `effort: "low"` — die Aufgabe ist klein und gut spezifiziert; das hält Kosten und Wartezeit niedrig, ohne an der Modellwahl zu drehen.
- **Inhaltliche Leitplanken im System-Prompt** spiegeln die Vorgaben aus Phase 1: Gesundheit ohne Gewichts-/Kalorienziele, Finanzen ohne konkrete Anlageempfehlungen.
- Vorschläge werden **nicht automatisch** übernommen: der Nutzer wählt aus, und neue Knoten hängen sich an den tiefsten bereits abgeschlossenen Knoten des Bereichs, damit der Baum nach unten wächst statt auszufransen.
- `stop_reason: "refusal"` wird abgefangen und als verständliche Meldung zurückgegeben, statt als leere Antwort zu erscheinen.

## Offline-Betrieb & Installierbarkeit

### Lokal-zuerst statt Cloud-zuerst

- Die frühere Lösung schaltete im angemeldeten Zustand komplett auf Supabase um — jede Speicherung brauchte damit eine Verbindung. Das ist jetzt umgedreht: **`SyncingRepository` schreibt immer zuerst lokal** (Dexie) und hängt die Änderung zusätzlich an eine **Outbox** an, die im Hintergrund in die Cloud gespielt wird.
- Lesen geht ausschließlich lokal — die App ist dadurch auch bei schlechter Verbindung sofort bedienbar.
- **Die Outbox ist ein geordnetes Log, kein Mengen-Abgleich.** `drainQueue` spielt die Einträge in Einfügereihenfolge ab und **stoppt beim ersten Fehler**. Das ist bewusst so: Ein Überspringen könnte eine spätere Änderung desselben Datensatzes vor eine frühere ziehen — oder ein Löschen vor das zugehörige Anlegen.
- Die Reihenfolge-Logik liegt in `lib`-Manier als **reine Funktion** (`data/outbox.ts`) getrennt von Speicher und Netzwerk, damit genau dieser Teil testbar ist. Hier verliert man am leisesten Daten.
- **Beim Anmelden** wird zuerst die Outbox geleert, dann der Cloud-Stand geholt und lokal als Basis gesetzt. Ist noch etwas ausstehend, wird **nicht** überschrieben — sonst würden Offline-Änderungen verworfen.
- Konflikte zwischen zwei Geräten werden weiterhin per *last write wins* aufgelöst. Für einen Einzelnutzer ist das angemessen; echtes Merging wäre deutlich mehr Maschinerie ohne erkennbaren Gewinn.
- Der Sync-Status ist nur sichtbar, **wenn es etwas zu sehen gibt**: offline oder mit ausstehenden Uploads. Ein dauerhaftes „alles synchron" wäre nur Rauschen.

### PWA

- `vite-plugin-pwa` mit `registerType: 'autoUpdate'` — neue Versionen werden ohne Zutun übernommen.
- `start_url` und `scope` sind **relativ** (`.`), damit die App eine Umbenennung des Repositorys überlebt (der Pfad auf GitHub Pages ändert sich dabei).
- Nur die App-Hülle wird gecacht. **Supabase-Anfragen laufen bewusst nie über den Cache** — Offline-Fähigkeit kommt aus der Outbox, nicht aus veralteten Antworten.

### Tests

- Erstmals automatisierte Tests (Vitest), gezielt für die Outbox: reine Reihenfolge-Logik plus Integration von `SyncingRepository` gegen echtes Dexie (via `fake-indexeddb`) mit einer Cloud-Attrappe. Abgedeckt sind die Fälle, die still Daten verlieren würden: Schreiben ohne Verbindung, Nachsenden in Reihenfolge, Fehler mitten in der Warteschlange.

## KI-generierter Start-Baum

- **Der Zeitpunkt ist das eigentliche Problem:** Die KI-Funktionen setzen eine Anmeldung voraus, das Onboarding läuft aber normalerweise, bevor jemand ein Konto hat. Gelöst als **Wahl am Ende des Fragebogens** — „von der KI entwerfen lassen" (öffnet bei Bedarf direkt den Anmelde-Dialog und startet danach automatisch) oder „aus Vorlagen erstellen" (sofort, ohne Konto, ohne Netz). Der Vorlagen-Pfad bleibt damit vollwertig und ist die Rückfallebene.
- **Ein Aufruf pro Bereich statt einem für alles.** Ein Fehler betrifft dann nur einen Bereich — der fällt still auf seine Vorlage zurück, statt das ganze Onboarding scheitern zu lassen. Nebeneffekt: Die Bäume laufen parallel und der Fortschritt ist pro Bereich sichtbar.
- **Acyclicity wird nicht erhofft, sondern erzwungen.** `sanitizeAiNodes` behält eine Voraussetzung nur, wenn sie auf einen **weiter oben in der Liste** definierten Knoten zeigt. Ein Modell, das einen Key erfindet, auf sich selbst zeigt oder einen Kreis baut, kann deshalb keinen Baum mit unerreichbaren Knoten erzeugen. Unplausible Werte (XP, stage, type) werden auf den nächstliegenden gültigen Wert gezogen, statt den Knoten zu verwerfen.
- **Vorlagen und KI teilen den Zusammenbau.** Beide Pfade erzeugen `ResolvedNode[]`, danach ist der Code identisch — inklusive der Regel, dass Knoten unterhalb des angegebenen Erfahrungsstands als bereits erledigt starten. Das Feature „du startest auf deinem echten Level" gilt damit auch für KI-Bäume.
- Das Modell bekommt `stage` als Ordnungsprinzip vorgegeben (0 = Grundlage … 3 = Meisterschaft) und wird angewiesen, **Verzweigungen statt einer Kette** zu bauen — sonst entsteht regelmäßig ein linearer Strang, der die Baum-Darstellung sinnlos macht.

## XP-System (fest statt frei wählbar)

Leitsatz: **Der Nutzer beschreibt, was er getan hat — das System bestimmt den Wert.** Frei eingetippte Zahlen machen Level unvergleichbar (zwischen Bereichen, über die Zeit, zwischen Personen) und wären mit Gruppen vollends wertlos. An keiner Stelle der App lässt sich noch eine XP-Zahl eingeben.

- **Aktivitäten:** Auswahl aus dem Katalog des Bereichs plus eine Umfangsstufe (`kurz` ×0,5 / `normal` ×1 / `ausgiebig` ×2). Der Katalogwert bildet den typischen Aufwand ab, die Stufe die konkrete Ausprägung. Untergrenze 5 XP, damit nichts wertlos wird. Bereiche ohne eigenen Katalog (selbst angelegte) bekommen einen generischen.
- **Knoten:** `Typ + Tiefe im Baum`. Quest 50 / Gewohnheit 75 / Meilenstein 125, plus 25 je Ebene — wer tiefer im Baum steht, musste mehr Voraussetzungen abräumen. Die Tiefe ist bei 6 gedeckelt, sonst könnte eine künstlich lange Kette die Belohnungen beliebig hochtreiben.
- **Ziele:** Größenklasse statt Zahl (klein 100 / mittel 250 / groß 500). Auch hier klassifiziert der Nutzer, das System bepreist.
- **Ressourcen:** unverändert fest je Typ.
- **Auch KI und Vorlagen dürfen nicht bepreisen.** Beim Zusammenbau eines Baums wird `xpReward` grundsätzlich neu berechnet — ein vom Modell vorgeschlagener Wert wird verworfen. Sonst hinge die Ökonomie an der Tageslaune eines Sprachmodells.
- **Keine rückwirkende Änderung.** Beim Speichern wird nur der bearbeitete Knoten neu bepreist; bereits vergebene Belohnungen und alte Log-Einträge bleiben, wie sie waren. Historische XP aus der Zeit der freien Eingabe werden also nicht umgerechnet — das würde Level ohne Zutun des Nutzers verschieben.

## Überschneidende Themen („XP für zwei Sachen")

Ausgangspunkt: Wer Spanisch lernt, trainiert dabei auch Kommunikation. Das soll sich nicht zwischen zwei Bereichen entscheiden müssen.

- **Eine Aktivität, ein Eintrag, mehrere Bereiche.** `LogEntry` bekommt `secondaryAreaIds`; jeder beteiligte Bereich erhält die **vollen** XP. Die Alternative — die XP aufteilen — wurde verworfen: Ein Gespräch auf Spanisch ist keine halbe Spanisch-Übung, und geteilte XP hätten das Feature bestraft statt belohnt. Kein Duplizieren des Eintrags, sonst zählt der Verlauf dieselbe Sache mehrfach.
- **Missbrauch wird über den Zuschnitt begrenzt, nicht über Regeln.** Maximal zwei Zusatzbereiche pro Aktivität. Wer alles überall anhakt, hebt sein Charakter-Level — aber alle Bereichs-Level steigen dann gleichmäßig, was den Vergleich zwischen Bereichen (der eigentliche Nutzen) selbst entwertet. Eine harte Prüfung, ob eine Überschneidung „echt" ist, kann die App nicht leisten.
- **Überschneidung gehört zum Bereich, nicht zur einzelnen Aktivität.** Ein selbst angelegter Bereich kann bis zu zwei bestehende als überlappend markieren (`Area.linkedAreaIds`); beim Protokollieren sind diese dann **vorausgewählt**. Sonst müsste man sich bei jedem Eintrag neu erinnern — genau das würde das Feature im Alltag versanden lassen. Übersteuern bleibt jederzeit möglich.
- **Nur eine Level-Up-Feier pro Aktivität.** Steigen mehrere Bereiche gleichzeitig, wird der erste gefeiert; mehrere Vollbild-Overlays hintereinander wären Lärm. Der XP-Toast zeigt stattdessen `× N`.
- **Löschen lässt keine Leichen zurück.** Wird ein Bereich gelöscht, verlieren fremde Log-Einträge nur diesen Bereich (der Eintrag selbst gehört ja dem anderen) und andere Bereiche verlieren ihn aus ihrer Überschneidungsliste.

## Eigene Themen mit KI-Baum

- Ein neuer Bereich kann sich seinen Baum direkt beim Anlegen von der KI entwerfen lassen — dieselbe Funktion und derselbe Zusammenbau wie im Onboarding (`buildCustomArea` teilt `materializeNodes` mit `generateSetup`). Damit ist ein später ergänztes „Spanisch" exakt so bepreist und eingestuft wie die fünf Kernbereiche; eine zweite, abweichende Pricing-Logik wäre der wahrscheinlichste Weg, das XP-System wieder zu zerlegen.
- Die Frage nach dem Erfahrungsstand bleibt auch hier drin: Wer schon Grundlagen hat, startet nicht bei null.
- **Der Bereich geht nie an einem KI-Fehler verloren.** Schlägt der Aufruf fehl, bleibt das Formular mit allen Eingaben stehen und der Bereich lässt sich mit einem Klick ohne Baum anlegen.
- Die markierten Überschneidungen gehen als Kontext in den Prompt (`overlaps`), damit ein bis zwei Knoten entstehen, die beides gleichzeitig voranbringen.

## Offene Annahmen / bewusst verschoben

- Kein Undo für Löschaktionen (nur Bestätigungsdialog) – für ein lokales Single-User-MVP akzeptiert.
- Log-Einträge löschen entfernt die XP **nicht** rückwirkend (Logs sind Journal, keine Buchhaltung). Store-API `deleteLog` existiert, ist aber bewusst nicht prominent in der UI.
- Getestet sind Outbox, Sync, XP-Kurve, Baum-Zusammenbau und die Mehrfach-Bereichs-Vergabe im Store. `lib/tree.ts`, `lib/streak.ts` und `lib/achievements.ts` sind als reine Funktionen geschnitten und ebenso leicht testbar; verifiziert wurden sie bisher über Browser-Durchläufe.
- Das Onboarding lässt sich nach dem Abschluss nicht erneut starten – der Baum wird stattdessen manuell weiter bearbeitet. Ein „Baum zurücksetzen" wäre ein eigenes Feature.
- Phase 3: KI-Vorschläge (Anthropic API), Accounts + Sync – Repository-Interface ist dafür vorbereitet.
