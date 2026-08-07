# ⚔️ Life RPG

Dein Leben als Skill-Tree: Level dich in Wissen, Kommunikation, Gesundheit,
Purpose und Finanzen – wie in einem RPG, nur echt.

## Features

- **Zielgetriebene Bäume**: Du gibst pro Bereich dein konkretes Hauptziel an – der Baum ist der Weg dorthin. Nebenziele bekommen eigene Äste, sichtbar getrennt vom Hauptweg
- **„Und wie?"**: Jeder Skill bringt konkrete Handlungsschritte mit – nicht nur „lies ein Buch", sondern woran du es festmachst, wie oft und woran du merkst, dass es erledigt ist
- **Notizen an jeder Aufgabe**: Bei „notiere 21 Tage lang, wie die Gespräche liefen" ist die Notiz das Ergebnis, nicht ein Nebenprodukt. Jeder Skill hat ein Notizfeld; Aufgaben, bei denen das Schreiben die Aufgabe *ist*, bieten es direkt an
- **Journal**: eigener Reiter mit allen Tagen, an denen du etwas festgehalten oder geschafft hast. Tag antippen → alle Notizen dieses Tages, dazu Aktivitäten und abgeschlossene Skills als Kontext
- **Tagesquest**: Jeden Tag ist ein Skill hervorgehoben – schaffst du ihn heute, gibt es 50 % Bonus-XP obendrauf
- **Gruppen**: mit Freunden gemeinsam leveln – ihr seht gegenseitig Level, Bereichs-Level und Streak. Aktivitäten, Skills, Ziele und Notizen bleiben privat
- **Installierbar als App** (PWA): eigenes Icon, Start ohne Browserleiste, funktioniert auch ohne Netz
- **Offline-fähig**: Änderungen werden immer sofort lokal gespeichert und automatisch hochgeladen, sobald wieder Verbindung besteht
- **Konten & Cloud-Sync** (optional): angemeldet teilen Handy und Desktop denselben Spielstand; ohne Konto läuft alles rein lokal weiter
- **Eigene Themen mit KI-Baum**: „Spanisch" anlegen, Erfahrungsstand und Ziel angeben – der Skill-Tree dafür entsteht direkt beim Anlegen
- **Überschneidende Bereiche**: eine Aktivität kann für mehrere Bereiche zählen und gibt jedem die **vollen** XP – Spanisch sprechen trainiert eben auch Kommunikation. Überschneidungen werden am Bereich hinterlegt und sind beim Protokollieren vorausgewählt
- **KI-generierter Start-Baum**: im Onboarding entwirft die KI aus deinen Antworten für jeden Bereich einen eigenen Baum – mit Verzweigungen statt einer Kette
- **KI-Vorschläge** für neue Skills, passend zu Level, Baum und Zielen – der API-Schlüssel bleibt serverseitig
- **Onboarding-Fragebogen**, der aus deinen Antworten (Erfahrungsstand, Fokus, Ziele) einen **personalisierten Skill-Tree** pro Bereich generiert – wer schon weit ist, startet mit entsprechendem Level statt bei null
- **23 Abzeichen** in Bronze/Silber/Gold mit Fortschrittsanzeige und Freischalt-Feedback
- **Ressourcen-Bibliothek** über alle Bereiche hinweg, mit Suche und Filtern nach Bereich, Typ und Status
- **5 Kernbereiche** (frei abwählbar) + beliebig viele eigene Bereiche
- **Skill-Tree-Visualisierung** pro Bereich (React Flow): Hauptweg und Nebenwege als eigene Spalten, abgeschlossene, verfügbare und gesperrte Knoten mit Verbindungslinien, zoom- und scrollbar
- **Keine erzwungene Reihenfolge**: Der Baum schlägt einen Weg vor – abhaken kannst du jeden Skill, auch wenn davor noch etwas offen ist
- **Knoten, Ziele & Ressourcen** frei anlegen, bearbeiten und löschen – du bist der Autor deines Baums
- **Aktivitäten protokollieren** mit Schnellauswahl pro Bereich → XP mit sichtbarem Feedback (XP-Toast, Level-Up-Overlay)
- **Festes XP-System**: du wählst Aktivität und Umfang, den Wert bestimmt die App – keine frei eintippbaren Zahlen, damit Level vergleichbar bleiben
- **Level-Kurve** mit steigender Schwelle (`100 · n^1.5`) – unendliche Progression
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
  types/       Domain-Typen (Profile, Area, SkillNode, LogEntry, Note, Goal,
               Resource, Gruppen)
  lib/         Reine Logik: XP-Kurve, Baum-Status/-Tiefe/-Wege, Streak,
               Abzeichen, Tagesquest, Journal-Gruppierung, Gruppen-Schnappschuss
  data/        Repository-Interface mit lokaler (Dexie), Cloud- (Supabase) und
               synchronisierender Implementierung; Outbox; Onboarding-Katalog + Baum-Generator
  store/       Zustand-Store (App-Logik, XP-Vergabe, CRUD, Abzeichen-Auswertung)
  components/  UI-Bausteine (SkillTree, Modals, XP-Bar, Feedback-Overlays, Tabs)
  pages/       Screens: Onboarding, Dashboard, Area-Detail, Journal,
               Bibliothek, Abzeichen, Gruppen
supabase/
  schema.sql   Tabellen, Gruppen-Funktionen + Row Level Security
  functions/   Edge Functions für KI-Vorschläge und Baum-Generierung
               (halten den API-Schlüssel serverseitig)
```

Design-Entscheidungen und Annahmen: siehe [DECISIONS.md](./DECISIONS.md).

## Roadmap

Phasen 1–3 sind umgesetzt, dazu Offline-Betrieb, Installierbarkeit,
überschneidende Bereiche, Gruppen und das Journal. Naheliegende nächste
Schritte: wöchentlicher Rückblick mit Fokus-Empfehlung, Suche im Journal,
gemeinsame Gruppen-Ziele.
