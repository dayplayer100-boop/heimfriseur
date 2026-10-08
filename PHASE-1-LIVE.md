# Phase 1 sicher im Live-Projekt ausführen

Die Befehle gehören ins Terminal von **Google Cloud Shell**, nicht in den SQL-Editor.
Projekt: `heimfriseur-dayplayer100`. Website: `heimfriseur-test-237368331242`.
Für das kostenlose Spark-Projekt wird IAM über deinen bestehenden Google-Zugang verwendet, keine Cloud Function und kein Zahlungskonto.

## 1. Richtigen Quellcode öffnen

```bash
cd ~/heimfriseur-firebase/heimfriseur-firebase
git status --short
```

Bei lokalen Änderungen zuerst sichern; insbesondere die eigene Hosting-Site in `firebase.parallel.json` erhalten. Nicht mit `git reset --hard` löschen.
Für Phase 1 die geprüfte Version 6.4.1 verwenden. Neuere Regeln verlangen zusätzliche Migrationen aus Phase 2/3 und sind für diesen alleinigen Phase-1-Schritt nicht geeignet.

```bash
git fetch origin firebase-spark
git worktree add ../heimfriseur-phase1-live 6f2efb8d45746899ce90dbd56842f93790d0be0b
cd ../heimfriseur-phase1-live
npm ci
npm run build:firebase
gcloud auth list --filter=status:ACTIVE
```

Die neue Arbeitskopie lässt deinen bisherigen Entwicklungsstand unverändert. Falls sie schon existiert, in diese Kopie wechseln und den Commit mit `git log -1 --oneline` prüfen.

## 2. Tatsächliche Firmen-ID ermitteln

Am einfachsten: [Firestore-Datenansicht](https://console.firebase.google.com/project/heimfriseur-dayplayer100/firestore/databases/-default-/data) → Collection **hf_businesses** → aktives Unternehmen von **t-cut@web.de**. Die Dokument-ID kopieren. Nicht E-Mail, Firmenname oder Auth-UID raten.

Alternativ im Terminal: Das Listenwerkzeug aus dem aktuellen Branch beziehen. Es verwendet IAM und zeigt ausschließlich aktive Firmen und deren Zuordnung:

```bash
git show origin/firebase-spark:scripts/lib/firebase-operator.mjs > /tmp/heimfriseur-operator.mjs
git show origin/firebase-spark:scripts/firebase-list-businesses.mjs > /tmp/heimfriseur-list-businesses.mjs
sed -i 's|./lib/firebase-operator.mjs|./heimfriseur-operator.mjs|' /tmp/heimfriseur-list-businesses.mjs
node /tmp/heimfriseur-list-businesses.mjs --project heimfriseur-dayplayer100
read -r -p 'Aktive Unternehmens-Dokument-ID von T-cut: ' HF_BUSINESS_ID
```

Ausgabe prüfen: Geschäftsführung **t-cut@web.de**, gewünschtes aktives Unternehmen. Falls mehrere Firmen existieren, jede zu erhaltende Firma separat migrieren; keine Firma als Nebenwirkung löschen.

## 3. Dry-Run, Regeln und Migration

Dry-Run verändert nichts. Ist bereits eine fremde Migration aktiv oder passen geschützte/alte Kontakte nicht zusammen, erst die Ursache klären.

```bash
node scripts/firebase-migrate-payment-contacts.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID"
npx --yes --package firebase-tools@15.32.1 firebase deploy --only firestore:rules --config firebase.parallel.json --project heimfriseur-dayplayer100
node scripts/firebase-migrate-payment-contacts.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID" --apply
```

Nach Installation der Regeln sind operative Mitarbeiter-Lesezugriffe bei unbereinigten Firmen gesperrt. Während der Migration ist das Unternehmen auch für Administratoren gesperrt. Das ist das geplante Wartungsfenster. Die Sicherung liegt außerhalb des Repositorys unter `~/.heimfriseur-backups/` (Ordner 0700, Datei 0600). Kein Backup oder Token in Chat/GitHub hochladen.

**Nur bei erfolgreichem Datenvergleich** gibt das Skript die Firma wieder frei. Bei Fehler bleibt sie gesperrt. Nach Ursachenprüfung denselben Befehl mit `--apply --resume` verwenden; Marker nicht manuell entsperren.

## 4. Testwebsite veröffentlichen und prüfen

Hosting-Ziel in der neuen Kopie ausdrücklich auf die bestehende Testsite setzen:

```bash
node --input-type=module -e 'import fs from "node:fs"; const p="firebase.parallel.json"; const c=JSON.parse(fs.readFileSync(p,"utf8")); c.hosting.site="heimfriseur-test-237368331242"; fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");'
npx --yes --package firebase-tools@15.32.1 firebase deploy --only hosting --config firebase.parallel.json --project heimfriseur-dayplayer100
```

Die Supabase-Website `heimfriseur-app.web.app` bleibt unberührt. In installierter App und Browser aktualisieren; Version 6.4.1 kontrollieren. Geschäftsführung sieht historische Kontakte; Mitarbeiter ohne Abrechnungsrecht sehen nur Zahlungsstatus. Eine Statusänderung darf den geschützten Kontakt nicht löschen. Danach erst mit den neuen Regeln/Migrationen der weiteren Phasen fortfahren.
