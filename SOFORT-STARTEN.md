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

- **iPhone / iPad:** Die veröffentlichte Adresse in Safari öffnen, auf Teilen tippen und „Zum Home-Bildschirm“ wählen.
- **Android:** Die Adresse in Chrome öffnen, Browser-Menü → „App installieren“ oder „Zum Startbildschirm hinzufügen“.

Die Installation macht die App vom Startbildschirm erreichbar. Für das Laden und Speichern echter Kundendaten ist weiterhin Internet erforderlich.

## Veröffentlichung direkt über GitHub (optional)

Unter Repository → Settings → Secrets and variables → Actions:

- Öffentliche Repository-Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Privates Repository-Secret: `FIREBASE_SERVICE_ACCOUNT` mit dem JSON eines für Hosting berechtigten Dienstkontos des gewünschten Firebase-Projekts. Ausschließlich direkt in GitHub eintragen; niemals in Quellcode oder Chat einfügen.

Danach unter Actions den Workflow **„Auf Firebase veroeffentlichen“** starten und die Firebase-Projekt-ID angeben. Der Workflow läuft nur bei manuellem Start. Ohne Secret wird er vor dem Deployment beendet. Der Workflow **„App pruefen“** überprüft automatisch Tests und Build.
