# Cloud-Setup (Konten, Sync und KI-Vorschläge)

Die App läuft **auch ohne dieses Setup** vollständig — dann liegen alle Daten
lokal im Browser und die KI-Vorschläge sind ausgeblendet. Wer Konten,
Geräte-Sync und KI-Vorschläge will, richtet einmalig ein Supabase-Projekt ein.

Rechne mit etwa 15 Minuten. Du brauchst dafür kein Terminal.

---

## 1. Supabase-Projekt anlegen

1. Auf https://supabase.com registrieren (kostenlos) und **New project** anklicken.
2. Name frei wählen (z. B. `life-rpg`), ein Datenbank-Passwort setzen und eine
   Region in deiner Nähe auswählen (z. B. *Central EU (Frankfurt)*).
3. Warten, bis das Projekt bereitsteht (ein bis zwei Minuten).

## 2. Datenbank-Tabellen anlegen

1. Im Supabase-Projekt links auf **SQL Editor** → **New query**.
2. Den kompletten Inhalt von [`supabase/schema.sql`](./supabase/schema.sql)
   hineinkopieren und auf **Run** klicken.

Damit entstehen alle Tabellen samt *Row Level Security* — jede Zeile gehört
genau einem Konto, niemand kann fremde Daten lesen oder schreiben.

## 3. Zugangsdaten in GitHub hinterlegen

1. In Supabase links auf **Project Settings → API**. Dort stehen:
   - **Project URL** (z. B. `https://abcdefgh.supabase.co`)
   - **anon public** Key (ein langer Text)
2. In GitHub: **Settings → Secrets and variables → Actions → Variables** →
   **New repository variable**, und zwei Variablen anlegen:

   | Name                     | Wert                       |
   | ------------------------ | -------------------------- |
   | `VITE_SUPABASE_URL`      | die Project URL            |
   | `VITE_SUPABASE_ANON_KEY` | der **anon public** Key    |

> Der `anon`-Key ist dafür gemacht, im Browser zu stehen — er allein erlaubt
> keinen Datenzugriff, das regelt die Row Level Security. Den **service_role**
> Key dagegen niemals irgendwo eintragen.

Beim nächsten Deployment (z. B. nach dem nächsten Merge) erscheint in der App
oben rechts ein **Anmelden**-Knopf.

## 4. KI-Vorschläge aktivieren

Die KI läuft über eine Edge Function, damit dein Anthropic-Schlüssel **nur auf
dem Server** liegt und nie im Browser landet.

1. **Schlüssel hinterlegen:** In Supabase auf **Edge Functions → Secrets**
   (bzw. **Project Settings → Edge Functions**) und ein Secret anlegen:

   | Name                | Wert                          |
   | ------------------- | ----------------------------- |
   | `ANTHROPIC_API_KEY` | dein Schlüssel (`sk-ant-…`)   |

2. **Funktion veröffentlichen:** In Supabase auf **Edge Functions → Deploy a
   new function**, als Namen exakt **`suggest-nodes`** eintragen und den Inhalt
   von [`supabase/functions/suggest-nodes/index.ts`](./supabase/functions/suggest-nodes/index.ts)
   einfügen. Dann auf **Deploy**.

3. **„Verify JWT" ausschalten:** Bei der Funktion auf **Settings** (bzw. das
   Zahnrad neben `suggest-nodes`) und den Schalter **Verify JWT with legacy
   secret** / **Enforce JWT Verification** auf **aus** stellen.

   Das klingt nach einem Sicherheitsloch, ist aber keins: Die Prüfung des
   Gateways lehnt auch die Vorab-Anfrage ab, die jeder Browser aus
   Sicherheitsgründen vorher schickt (sie trägt per Definition noch keinen
   Anmelde-Token). Die Anfrage würde die Funktion also nie erreichen. Stattdessen
   prüft die Funktion den Token **selbst** — wer nicht angemeldet ist, bekommt
   weiterhin nur ein `401` zurück und erreicht die Anthropic-API nicht.

> **Wichtig:** Ein neu angelegtes oder geändertes Secret wirkt erst, nachdem die
> Funktion **einmal neu veröffentlicht** wurde.

Danach erscheint im Skill-Tree jedes Bereichs der Knopf **✨ KI-Vorschläge**
(sichtbar, sobald du angemeldet bist).

### Was kostet das?

Supabase ist im kostenlosen Tarif ausreichend. Für die KI zahlst du nur deinen
Anthropic-Verbrauch — eine Vorschlagsanfrage ist sehr klein, sodass normale
Nutzung typischerweise im Bereich weniger Cent pro Monat liegt.

---

## Wie der Wechsel zwischen lokal und Cloud funktioniert

- **Nicht angemeldet:** alles läuft wie bisher lokal im Browser (IndexedDB).
- **Erste Anmeldung:** ein vorhandener lokaler Spielstand wird automatisch in
  dein Konto hochgeladen, damit nichts verloren geht.
- **Angemeldet:** die App liest und schreibt in der Cloud — Handy und Desktop
  zeigen denselben Stand.
- **Abmelden:** die App fällt auf den lokalen Speicher zurück.
