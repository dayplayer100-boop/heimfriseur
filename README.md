## Firebase Spark – getrennte Testversion 6.3.0

Dieser Branch `firebase-spark` enthält die parallele Firebase-Version: Firebase Auth (E-Mail/Google) und Firestore mit getrennten Finanzdaten und Unternehmensrechten. Kein Zahlungskonto, keine Cloud Functions. Die Supabase-Version und die bestehende Hosting-Adresse bleiben erhalten.

**Einrichtung und Grenzen:** [FIREBASE-SPARK.md](FIREBASE-SPARK.md). **Prüfung auf Funktions-/Datenverlust:** [ERHALT-PRUEFUNG.md](ERHALT-PRUEFUNG.md). `npm ci`, `npm run build:firebase`; Ausgabe `dist-firebase`. Normales `npm run build` baut weiterhin die Supabase-Version nach `dist`. Die Firebase-Konfiguration ist öffentlich; keine privaten Schlüssel im Browser verwenden. Die Testversion ist noch nicht als Produktionsersatz freigegeben; echte Anmeldung, Google und Datenübertragung müssen in der eigenen Firebase-Konsole geprüft werden.

## Anmeldung und Sicherheit 6.1.0

Google-PKCE-Anmeldung, Bestätigung erneut senden, verständliche SMTP-Meldungen, TOTP-MFA mit serverseitigem AAL2-Schutz, bestätigte E-Mail vor Datenzugriff, Schutz-Header und aktualisierte Abhängigkeiten. Vollständige Einrichtung, Befunde und verbleibende Aufgaben: [SICHERHEIT-UND-ANMELDUNG.md](SICHERHEIT-UND-ANMELDUNG.md).

Nach 001–007 **008_auth_security.sql** einmal ausführen und veröffentlichen. SMTP und Google müssen zusätzlich in den Provider-Konsolen eingerichtet werden; der Frontend-Button allein aktiviert keinen Provider. Bestehende Rollen/Unternehmen bleiben unverändert. Node ≥22.12, Build `npm run build`, Ausgabe `dist`. Alle echten Kundendaten bleiben bei Supabase; statische Website auf Firebase Hosting.

## Datenschutzkorrektur 6.0.1

Mitarbeiter sehen keine Umsatzübersicht und keine Beträge/Materialkosten abgeschlossener Behandlungen, auch nicht ihrer eigenen. Diese Daten werden im Mitarbeiterabruf serverseitig entfernt. Namen, Leistungen, Dauer und Zahlungsstatus bleiben für die Arbeit sichtbar. Preise und Materialeingabe einer laufenden eigenen Behandlung bleiben für die Leistungserfassung verfügbar; sie sind keine Umsatzstatistik.

Nach bereits installierten 001–006 zuerst `supabase/migrations/007_employee_financial_privacy.sql` im Supabase SQL Editor ausführen. Zur gezielten Zuordnung des gemeldeten Mitarbeiterkontos anschließend `supabase/employee-access.sql` ausführen. Darin `MITARBEITER_EMAIL` und `GESCHAEFTSFUEHRER_EMAIL` vor dem Ausführen durch die tatsächlichen registrierten Adressen ersetzen. Dieses Betreiberskript setzt das angegebene Konto auf Mitarbeiter beim angegebenen Geschäftsführer, entfernt einen etwaigen App-Admin-Zugang und verweigert einen Unternehmenswechsel, wenn dabei bestehende Geschäftsdaten betroffen wären. Es löscht keine Geschäftsdaten. Konto anschließend abmelden und erneut anmelden; Besuche müssen unter Team weiterhin zugewiesen werden.

Danach Cloud Shell: `git pull origin main`, `npm ci`, `npm run build`, `npx --yes --package firebase-tools firebase deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100`. Version 6.0.1 auf Website und PWA laden. SQL-Dateien gehören in Supabase, Shellbefehle ausschließlich in Cloud Shell.

# HeimFriseur – Version 6.0

Mein Arbeitstag, Kundenwochenplanung, einmalige Terminänderungen mit erhaltenem Rhythmus, Abwesenheitsauswahl, Zahlungsübersicht, Rechtevorlagen, Speicheranzeige und gemeinsame Versionsprüfung für Website/PWA. Update-Anleitung: [ARBEITSTAG-UPDATE.md](ARBEITSTAG-UPDATE.md).

**Aktuelles Update:** Nach bereits ausgeführten Migrationen 001–005 ausschließlich `006_workday.sql` einmal ausführen. Danach `npm ci`, `npm run build` (Ausgabe `dist`) und auf der vorhandenen Firebase-Site veröffentlichen. Ältere Migrationen nicht erneut ausführen.

# HeimFriseur – Version 5.0

Einrichtungsassistent, eigenständige Heimpreislisten, direkte Kundengruppenzuordnung, Einzelkundentermine mit Zahleneingabe, ruhige Mitarbeiteransichten und getrennte technische App-Verwaltung. Vollständige Update-Anleitung: [EINFACHER-ARBEITSALLTAG-UPDATE.md](EINFACHER-ARBEITSALLTAG-UPDATE.md).

**Aktuell aktualisieren:** Nach bereits ausgeführten Migrationen 001–004 ausschließlich `005_clear_workflows.sql` einmal ausführen. Danach `npm ci`, `npm run build` (Ausgabe `dist`) und auf der vorhandenen Firebase-Site veröffentlichen. Die früheren Abschnitte unten dokumentieren ältere Versionen; deren Migrationen nicht erneut ausführen.

# HeimFriseur – Version 4.0 mit App-Admin

Zusätzlich zur Team- und Alltagsversion können ausdrücklich eingerichtete App-Admins alle Unternehmen auswählen und dort mit Geschäftsführerrechten arbeiten. Einrichtung, SQL-Bootstrap und Grenzen: [APP-ADMIN-UPDATE.md](APP-ADMIN-UPDATE.md).

**Bestehendes Projekt:** Nach bereits vorhandenen Migrationen 001–003 die Migration 004 einmal ausführen, ein bestätigtes Konto gezielt über SQL als ersten Admin aktivieren und die Website aktualisieren. Keine bestehende Migration erneut ausführen. Build: `npm ci` und `npm run build`, Ausgabe: `dist`.

# HeimFriseur – Version 3.0

Die bestehende Team-App enthält jetzt flexible Heim- und Kundenrhythmen, Untergruppen, Heimpreise, Zahlungsdokumentation, konfigurierbare Mitarbeiterrechte, lokalen Fotoimport, Einführung und Feedback. Anleitung und Grenzen: [PRACTICAL-UPDATE.md](PRACTICAL-UPDATE.md). Die Team-Grundlage ist in [TEAM-UPDATE.md](TEAM-UPDATE.md) dokumentiert.

**Bestehende Datenbank:** Migration 002 nur falls noch nicht installiert; anschließend 003 einmal ausführen. **Neue Datenbank:** 001, 002 und 003 in dieser Reihenfolge. Bereits ausgeführte Migrationen niemals wiederholen. Danach `npm ci`, `npm run build` und vorhandene Firebase-Site aktualisieren. Ausgabeordner: `dist`.

# HeimFriseur – Version 1

Mobile React-/TypeScript-Web-App für regelmäßige Friseurbesuche in Einrichtungen. Backend: Supabase Auth und PostgreSQL mit RLS. Firebase ist in diesem Export **ausschließlich als statischer Hosting-Anbieter** vorbereitet. Die App verwendet keine Firebase-Datenbank und keine Firebase-Authentifizierung.

## Entwicklungsstand

Der Quellcode enthält die V1-Funktionen für Stammdaten, Standardleistungen, Kalender, Besuche, Timer, Behandlungen, Farbrezepturen, Kosten, Auswertung, PDF und PWA. Build und lokale Prüfungen sind erfolgreich. Das Supabase-Projekt ist inzwischen eingerichtet und die öffentliche Browser-Verbindung in `src/deployment.ts` hinterlegt. Die Migration wurde vom Nutzer im SQL-Editor erfolgreich ausgeführt. Auth-Erreichbarkeit und anonyme Zugriffssperren für alle elf Tabellen und die Kontoinitialisierung wurden am echten Projekt geprüft. Der vollständige authentifizierte Ablauf einschließlich E-Mail-Bestätigung und Passwort-Reset muss noch mit dem eigenen Nutzerkonto geprüft werden.

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

Das konfigurierte HeimFriseur-Projekt wird automatisch verwendet. Um ein anderes Supabase-Projekt zu verwenden, `.env.local` bearbeiten und diese beiden Variablen setzen:

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

## Installation direkt von der Website

Ein sichtbarer Button „App installieren“ befindet sich auf der Anmeldeseite, in der App-Kopfleiste und unter Einstellungen → App. Wenn der Browser ein Installationsangebot bereitstellt, öffnet der Button dessen nativen Dialog. Auf iPhone/iPad und bei fehlendem Browserangebot erscheinen die passenden manuellen Schritte. In der installierten App wird der Button ausgeblendet.

Die zusätzliche Prüfung `APP_URL=http://localhost:4173 CHROMIUM_PATH=/usr/bin/chromium node scripts/install-check.mjs` prüft die sichtbare Schaltfläche, das Browser-Event für die Installation, den Zustand nach Installation und die iPhone-Anleitung. Der native Aufruf wird dabei über das Browser-Event simuliert; die tatsächliche Betriebssysteminstallation ist auf dem Endgerät zu prüfen.
