# HeimFriseur – Version 1

Mobile React-/TypeScript-Web-App für regelmäßige Friseurbesuche in Einrichtungen. Backend: Supabase Auth und PostgreSQL mit RLS. Firebase ist in diesem Export **ausschließlich als statischer Hosting-Anbieter** vorbereitet. Die App verwendet keine Firebase-Datenbank und keine Firebase-Authentifizierung.

## Entwicklungsstand

Der Quellcode enthält die V1-Funktionen für Stammdaten, Standardleistungen, Kalender, Besuche, Timer, Behandlungen, Farbrezepturen, Kosten, Auswertung, PDF und PWA. Build und lokale Prüfungen sind erfolgreich. Die Verbindung mit einem echten Supabase-Projekt und der Live-Test von Registrierung, E-Mail-Bestätigung und Passwort-Reset stehen noch aus: In dieser Entwicklungsumgebung wurden keine Supabase-Verbindungsdaten bereitgestellt. Die Migration wurde in einer lokalen PostgreSQL-Testumgebung geprüft, **nicht** auf einem entfernten Projekt ausgeführt.

Details und bewusste Vereinfachungen stehen in [ENTWICKLUNGSSTAND.md](ENTWICKLUNGSSTAND.md).

## Voraussetzungen

- Node.js 22 oder neuer und npm
- Ein Supabase-Projekt mit E-Mail-/Passwort-Anmeldung
- Für Hosting optional Firebase CLI und ein bereits ausgewähltes Firebase-Projekt

## Lokal starten (auch Windows / PowerShell)

Im entpackten Projektordner:

```powershell
npm ci
Copy-Item .env.example .env.local
```

`.env.local` bearbeiten und diese beiden Variablen setzen:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

`VITE_SUPABASE_ANON_KEY` akzeptiert den öffentlichen Supabase Publishable-Key oder den bisherigen öffentlichen Anon-Key. **Keinen Service-Role-Key oder privaten Schlüssel einsetzen.** Vite-Variablen mit `VITE_` werden Teil der Browser-App. Die Schutzgrenze liegt in Supabase Auth, RLS und den Datenbankregeln.

Unter macOS/Linux: `cp .env.example .env.local` statt `Copy-Item`.

```powershell
npm run dev
```

Adresse: `http://localhost:5173`. Ohne Verbindungsdaten bietet der Startbildschirm eine ausdrücklich gekennzeichnete Vorschau mit fiktiven Beispieldaten. Die Vorschau speichert Änderungen nur in `sessionStorage` dieses Browsers. Sie ist nicht für echte Kunden geeignet.

Alternativ lassen sich öffentliche Verbindungsdaten im Startbildschirm eingeben. Diese Einstellung gilt nur für den jeweiligen Browser. Für eine veröffentlichte App sind die Build-Variablen oben zu empfehlen.

## Supabase-Datenbank einrichten

1. In einem **neuen, leeren** Supabase-Projekt den SQL-Editor öffnen.
2. Den vollständigen Inhalt von `supabase/migrations/001_heimfriseur.sql` einmal ausführen. Die Migration verwendet eine Transaktion und legt Tabellen, Indizes, RLS, Fremdschlüssel und RPC-Funktionen an. Sie ist keine wiederholt auszuführende Seed-Datei.
3. Unter Authentication die Anmeldung mit E-Mail/Passwort aktivieren und die gewünschte E-Mail-Bestätigung einstellen.
4. Unter Authentication → URL Configuration die spätere Produktionsadresse als Site URL und die erlaubten Redirect-Adressen eintragen. Für lokale Entwicklung `http://localhost:5173/**` freigeben; für die Produktionsadresse entsprechend `https://DEINE-DOMAIN/**`. Passwort-Reset nutzt `/?reset=1`.
5. Die öffentlichen Verbindungsdaten in `.env.local` setzen, Entwicklungsserver neu starten bzw. neu bauen.
6. Ein Konto registrieren, ggf. E-Mail bestätigen und anmelden. Beim ersten Login werden das Unternehmensprofil und sieben Beispiel-Leistungen angelegt. Keine Einrichtungen oder Kunden werden in reale Nutzerkonten eingesät.

Die Beispieldaten mit Sonnengarten und den drei fiktiven Kunden sind ausschließlich im separaten Vorschau-Modus vorhanden und unter Einstellungen → App zurücksetzbar.

## Build und Prüfungen

```powershell
npm run check
npm test
npm run build
```

- Build-Befehl: **`npm run build`**
- Ausgabeordner: **`dist`**
- Lokale Vorschau des Builds: `npm run preview`
- `npm ci` verwendet die mitgelieferte `package-lock.json`.

Die Datenbanktests nutzen PGlite (lokales PostgreSQL). Sie benötigen keinen Supabase-Schlüssel und erzeugen keine echten Konten. Nur für den Test ersetzen sie die Supabase-Auth-Umgebung durch zwei fiktive Nutzer und lassen `pgcrypto` weg; UUIDs stellt PostgreSQL selbst bereit.

Optionaler Browser-Test mit Playwright:

```powershell
npx playwright install chromium
```

In einem Terminal `npm run dev`, in einem zweiten `npm run test:browser` ausführen. Der Test arbeitet ausschließlich in der Vorschau und prüft Timer/Neuladen, Abschluss, Material, Folgetermin, PDF, Auswertung und Stammdaten. Für einen anderen lokalen Server lässt sich `APP_URL` setzen. Für einen laufenden Produktions-Preview kann zusätzlich `CHECK_PWA=1` gesetzt werden, um Manifest, Icons und Offline-Seite zu prüfen. Unter Linux kann `CHROMIUM_PATH` einen vorhandenen Chromium angeben. `QA_SCREENSHOT_DIR` schreibt optional Screenshots und ein fiktives Test-PDF; solche Artefakte sind nicht Bestandteil dieses Exports.

## GitHub

Der ZIP-Export enthält keine Git-Zugangsdaten und keinen `.git`-Ordner. Im entpackten Projekt können ein lokales Repository und anschließend das gewünschte GitHub-Remote eingerichtet werden. Die mitgelieferte `.gitignore` schließt `.env`, `.env.local`, `node_modules`, `dist`, Build-Caches und lokale Hosting-Dateien aus. `.env.example` enthält nur Platzhalter und kann mit eingecheckt werden.

## Firebase Hosting

`firebase.json` ist fertig vorbereitet: `dist` als Webroot, SPA-Rewrite auf `index.html`, langes Caching für versionierte Assets und `no-cache` für Service Worker und HTML.

Im Windows-Chat das bereits gewünschte Firebase-Projekt auswählen. Es liegt absichtlich keine `.firebaserc` mit einer Projekt-ID bei. Für die spätere Veröffentlichung nach Auswahl des richtigen Projekts:

```powershell
npm run build
firebase deploy --only hosting --project DEINE_FIREBASE_PROJEKT_ID
```

Das ist eine Anleitung; **während der Erstellung dieses Exports wurde kein Deployment vorgenommen und kein Firebase-Projekt verändert**. In GitHub-Actions ggf. die zwei öffentlichen Vite-Variablen vor dem Build bereitstellen. GitHub-/Firebase-Deploy-Schlüssel gehören in die jeweiligen Secret-Verwaltungen, nicht in dieses Repository.

## Struktur

- `src/App.tsx`: Navigation, Auth-Gate und Dialoge
- `src/store.tsx`, `src/supabase.ts`: echte Supabase-Anbindung und Datenzustand
- `src/Records.tsx`, `src/Forms.tsx`: Stammdaten und Eingabeformulare
- `src/Calendar.tsx`: Monat, Woche und mobile Liste
- `src/Visit.tsx`: Kundenliste, Behandlung und Besuchsabschluss
- `src/domain.ts`: zentrale Berechnungen, Datums- und Währungsformatierung
- `src/Reports.tsx`, `src/pdf.ts`: Kennzahlen und Besuchsberichte
- `src/demo.ts`: ausdrücklich getrennte, fiktive Vorschau
- `supabase/migrations/001_heimfriseur.sql`: produktives Datenmodell und RLS
- `public/`: PWA-Manifest, Icons, Service Worker und Offline-Seite
- `tests/`, `scripts/browser-check.mjs`: Datenbank-, Berechnungs- und Browserprüfungen

## Betrieb

Echte Schreibvorgänge benötigen Internet. Der Service Worker speichert nur die Offline-Seite, keine Kunden-, Behandlungs- oder Auth-Daten. Regelmäßige Datenbank-Backups im Supabase-Projekt einrichten. Ein Logo kann als Bild-URL in den Unternehmensdaten hinterlegt werden; für die Übernahme ins PDF muss die Quelle Browserzugriff per CORS erlauben. Ein nicht ladbares Logo verhindert den Bericht nicht.
