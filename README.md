# ⚔️ Life RPG

Dein Leben als Skill-Tree: Level dich in Wissen, Kommunikation, Gesundheit,
Purpose und Finanzen – wie in einem RPG, nur echt.

## Features (Phase 1 – MVP)

- **5 Kernbereiche** mit vorgefertigten Beispiel-Skill-Trees + beliebig viele eigene Bereiche
- **Skill-Tree-Visualisierung** pro Bereich (React Flow): abgeschlossene, verfügbare und gesperrte Knoten mit Verbindungslinien, zoom- und scrollbar
- **Knoten, Ziele & Ressourcen** frei anlegen, bearbeiten und löschen – du bist der Autor deines Baums
- **Aktivitäten protokollieren** mit Schnellauswahl pro Bereich → XP mit sichtbarem Feedback (XP-Toast, Level-Up-Overlay)
- **XP- & Level-System** mit steigender Level-Kurve (`100 · n^1.5`) – unendliche Progression
- **Dashboard** mit Charakter-Level, Streak, XP-Balken und dem empfohlenen nächsten Schritt pro Bereich
- **Lokale Persistenz** in IndexedDB (Dexie) hinter einer Repository-Schicht – bereit für ein späteres Backend

## Starten

```bash
npm install
npm run dev
```

Dann die angezeigte URL öffnen (standardmäßig http://localhost:5173).

Produktions-Build:

```bash
npm run build
npm run preview
```

## Tech-Stack

React 18 · TypeScript · Vite · Tailwind CSS 4 · React Flow (@xyflow/react) · Zustand · Dexie (IndexedDB)

## Projektstruktur

```
src/
  types/       Domain-Typen (Profile, Area, SkillNode, LogEntry, Goal, Resource)
  lib/         Reine Logik: XP-Kurve, Baum-Status/-Tiefe, Streak
  data/        Dexie-Schema, Repository-Interface + IndexedDB-Implementierung, Seed-Daten
  store/       Zustand-Store (App-Logik, XP-Vergabe, CRUD)
  components/  UI-Bausteine (SkillTree, Modals, XP-Bar, Feedback-Overlays, Tabs)
  pages/       Screens: Welcome, Dashboard, Area-Detail
```

Design-Entscheidungen und Annahmen: siehe [DECISIONS.md](./DECISIONS.md).

## Roadmap

- **Phase 2:** Onboarding-Fragebogen mit personalisiertem Start-Baum, Achievements/Badges, erweiterte Ressourcen-Bibliothek
- **Phase 3:** KI-Personalisierung (Anthropic API), Accounts & Cloud-Sync
