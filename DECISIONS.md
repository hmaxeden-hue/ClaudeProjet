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
- XP-Quellen: Aktivitäten (frei wählbare XP, Presets 10/25/50/100), Knoten abschließen (`xpReward`), Ziele erreichen (`xpReward`, Default 100), Ressourcen abschließen (fix je Typ: Buch 100, Video 25, Kurs 150, Sonstiges 40 – nur beim ersten Wechsel auf „Fertig").
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

## Offene Annahmen / bewusst verschoben

- Kein Undo für Löschaktionen (nur Bestätigungsdialog) – für ein lokales Single-User-MVP akzeptiert.
- Log-Einträge löschen entfernt die XP **nicht** rückwirkend (Logs sind Journal, keine Buchhaltung). Store-API `deleteLog` existiert, ist aber bewusst nicht prominent in der UI.
- Keine Tests im MVP; die Logik-Kerne (`lib/xp.ts`, `lib/tree.ts`, `lib/streak.ts`) sind als reine Funktionen geschnitten, damit Tests in Phase 2 leicht nachrüstbar sind.
- Phase 2: Onboarding-Fragebogen, Achievements/Badges, Ressourcen-Bibliothek übergreifend, Streak-Belohnungen.
- Phase 3: KI-Vorschläge (Anthropic API), Accounts + Sync – Repository-Interface ist dafür vorbereitet.
