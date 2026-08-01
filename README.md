# ⚔️ Life RPG

Dein Leben als Skill-Tree: Level dich in Wissen, Kommunikation, Gesundheit,
Purpose und Finanzen – wie in einem RPG, nur echt.

## Features

- **Installierbar als App** (PWA): eigenes Icon, Start ohne Browserleiste, funktioniert auch ohne Netz
- **Offline-fähig**: Änderungen werden immer sofort lokal gespeichert und automatisch hochgeladen, sobald wieder Verbindung besteht
- **Konten & Cloud-Sync** (optional): angemeldet teilen Handy und Desktop denselben Spielstand; ohne Konto läuft alles rein lokal weiter
- **KI-Vorschläge** für neue Skills, passend zu Level, Baum und Zielen – der API-Schlüssel bleibt serverseitig
- **Onboarding-Fragebogen**, der aus deinen Antworten (Erfahrungsstand, Fokus, Ziele) einen **personalisierten Skill-Tree** pro Bereich generiert – wer schon weit ist, startet mit entsprechendem Level statt bei null
- **21 Abzeichen** in Bronze/Silber/Gold mit Fortschrittsanzeige und Freischalt-Feedback
- **Ressourcen-Bibliothek** über alle Bereiche hinweg, mit Suche und Filtern nach Bereich, Typ und Status
- **5 Kernbereiche** (frei abwählbar) + beliebig viele eigene Bereiche
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

Die App läuft so vollständig lokal. Für Konten, Geräte-Sync und KI-Vorschläge
kommt einmalig ein Supabase-Projekt dazu – Anleitung in [SETUP.md](./SETUP.md).

Produktions-Build:

```bash
npm run build
npm run preview
```

Tests:

```bash
npm test
```

## Tech-Stack

React 18 · TypeScript · Vite · Tailwind CSS 4 · React Flow (@xyflow/react) · Zustand · Dexie (IndexedDB) · Supabase (Auth, Postgres, Edge Functions)

## Projektstruktur

```
src/
  types/       Domain-Typen (Profile, Area, SkillNode, LogEntry, Goal, Resource)
  lib/         Reine Logik: XP-Kurve, Baum-Status/-Tiefe, Streak, Abzeichen
  data/        Repository-Interface mit lokaler (Dexie), Cloud- (Supabase) und
               synchronisierender Implementierung; Outbox; Onboarding-Katalog + Baum-Generator
  store/       Zustand-Store (App-Logik, XP-Vergabe, CRUD, Abzeichen-Auswertung)
  components/  UI-Bausteine (SkillTree, Modals, XP-Bar, Feedback-Overlays, Tabs)
  pages/       Screens: Onboarding, Dashboard, Area-Detail, Bibliothek, Abzeichen
supabase/
  schema.sql   Tabellen + Row Level Security für den Cloud-Modus
  functions/   Edge Function für die KI-Vorschläge (hält den API-Schlüssel)
```

Design-Entscheidungen und Annahmen: siehe [DECISIONS.md](./DECISIONS.md).

## Roadmap

Phasen 1–3 sind umgesetzt, dazu Offline-Betrieb und Installierbarkeit.
Naheliegende nächste Schritte: KI-generierter Start-Baum im Onboarding,
Zerlegung großer Ziele in Zwischenschritte, wöchentlicher Rückblick.
