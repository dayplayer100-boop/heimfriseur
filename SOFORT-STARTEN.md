# HeimFriseur veröffentlichen und installieren

## Einmalig vom Windows-Rechner auf Firebase veröffentlichen

1. Projekt herunterladen oder das GitHub-Repository klonen.
2. Im Projektordner ein Terminal öffnen.
3. Folgende Befehle ausführen (Node.js 22 oder neuer erforderlich):

```powershell
npm ci
npm install -g firebase-tools
firebase login
firebase projects:list
```

`firebase login` öffnet die Anmeldung am eigenen Google-Konto. Keine privaten Schlüssel oder Login-Tokens in den Chat schicken.

Die gewünschte Projekt-ID aus der Liste verwenden:

```powershell
npm run build
firebase deploy --only hosting --project DEINE_PROJEKT_ID
```

Am Ende erscheint die HTTPS-Adresse. Ohne Supabase-Verbindung lässt sich zunächst die deutlich gekennzeichnete Vorschau installieren und ausprobieren. Für echte Kunden vorher die Supabase-Migration einrichten und die zwei öffentlichen Vite-Variablen in `.env.local` setzen; siehe README. Nach Änderungen an diesen Variablen neu bauen und veröffentlichen.

## Auf dem Smartphone installieren

Die Website bietet jetzt den Button **„App installieren“**. Klicke darauf: Auf unterstützten Browsern öffnet sich der Installationsdialog; andernfalls erscheinen die passenden Schritte.

- **iPhone / iPad:** Die veröffentlichte Adresse in Safari öffnen, auf Teilen tippen und „Zum Home-Bildschirm“ wählen.
- **Android:** Die Adresse in Chrome öffnen, Browser-Menü → „App installieren“ oder „Zum Startbildschirm hinzufügen“.

Die Installation macht die App vom Startbildschirm erreichbar. Für das Laden und Speichern echter Kundendaten ist weiterhin Internet erforderlich.

## Veröffentlichung direkt über GitHub (optional)

Unter Repository → Settings → Secrets and variables → Actions:

- Öffentliche Repository-Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Privates Repository-Secret: `FIREBASE_SERVICE_ACCOUNT` mit dem JSON eines für Hosting berechtigten Dienstkontos des gewünschten Firebase-Projekts. Ausschließlich direkt in GitHub eintragen; niemals in Quellcode oder Chat einfügen.

Danach unter Actions den Workflow **„Auf Firebase veroeffentlichen“** starten und die Firebase-Projekt-ID angeben. Der Workflow läuft nur bei manuellem Start. Ohne Secret wird er vor dem Deployment beendet. Der Workflow **„App pruefen“** überprüft automatisch Tests und Build.

## Kostenlose Adresse ohne Nutzername

Die zusätzliche Hosting-Konfiguration `firebase.clean.json` verwendet die Site-ID `heimfriseur-app`. In derselben bereits angemeldeten Cloud Shell:

```bash
cd ~/heimfriseur
git pull --ff-only && bash scripts/setup-clean-url.sh
```

Das Skript legt die Site im vorhandenen Projekt an und veröffentlicht den Build dort. Firebase prüft, ob der Name global frei ist. Wenn das Anlegen scheitert, stoppt das Skript vor dem Deployment. Die neue Adresse ist erst nach erfolgreichem Deployment gültig. Falls der Name vergeben ist, zuerst einen anderen Namen in der Konfiguration und im Skript festlegen.

Nach Erfolg in Supabase die Site URL auf `https://heimfriseur-app.web.app` setzen und zusätzlich `https://heimfriseur-app.web.app/**` zu den erlaubten Redirect URLs hinzufügen. Alte Redirect URLs können erhalten bleiben. Das vorhandene Projekt und die Datenbank werden weiterverwendet; an der neuen Adresse erneut anmelden und die PWA dort installieren.

Für spätere Aktualisierungen die Site nicht erneut anlegen:

```bash
cd ~/heimfriseur
git pull --ff-only
npm run build
npx --yes firebase-tools deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```
