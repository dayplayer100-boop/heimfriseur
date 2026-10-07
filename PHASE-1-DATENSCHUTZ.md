# Phase 1 – geschützte Rechnungskontakte (Version 6.4.1)

Implementiert: Audit SEC-01. Die übrigen Audit-Phasen sind weiterhin offen.
Keine echten Firebase-Daten wurden während der Entwicklung migriert.

## Sicherheitswirkung

- `records/treatment_payments~ID` enthält keine strukturierten Namen/Adressen von Rechnungsempfängern mehr. Eine serverseitige Feld-Allowlist verhindert ihre Wiedereinführung – auch bei direkten API-Schreibzugriffen.
- Diese Snapshots liegen in `payment_contacts/ID`. Geschäftsführung/App-Admin/Unternehmens-Admin haben ihre vorgesehenen vollständigen Unternehmensrechte. Mitarbeiter benötigen ausdrücklich `view_billing`, den passenden Heim-Scope und für Änderungen zusätzlich die Besuchszuweisung.
- Statusänderungen ohne Abrechnungsrecht verändern die geschützten Kontakte nicht. Historische Namen/Adressen werden bei solchen Statusänderungen weder gelöscht noch überschrieben.
- Neue Firmen haben `payment_contacts_schema: 1`. Bestehende Firmen erhalten den Marker erst nach geprüfter Migration. Ohne Marker sind operative Mitarbeiter-Lesezugriffe durch die neuen Regeln gesperrt. Dadurch kann nicht versehentlich eine alte, noch unbereinigte Firma freigegeben werden. Marker nur per Betreiberwerkzeug setzen, niemals manuell ungeprüft.
- Während der Migration ist die Firma mit `_migration_state: in_progress` gesperrt. Fehler lassen diese Sperre bestehen; keine Freigabe eines nur teilweise bereinigten Datenbestands.
- Neue Supabase→Firebase-Importe schreiben Kontakte ebenfalls geschützt. Geschäftsführerwechsel übernehmen die geschützten Dokumente atomar und behalten historische Snapshot-Inhalte bei.

## Vollständige Implementierung

| Datei | Aufgabe |
|---|---|
| `firebase-parallel/firestore.rules` | Zugriff, Feld-Allowlist, Schema-/Migrationssperre, sichere Kontaktzuordnung |
| `src/firebaseData.ts` | Trennung von Zahlungsstatus und Rechnungskontakten; Zusammenführung nur mit autorisiert geladenen Kontakten |
| `src/firebaseRepository.ts` | Berechtigte Queries und atomare Kontaktschreibzugriffe |
| `scripts/firebase-migrate-payment-contacts.mjs` | IAM-Migration mit Dry-Run, Backup, Konfliktprüfung, Vergleich und Resume |
| `scripts/firebase-migrate.mjs` | Geschützter Import und Inhaltvergleich |
| `src/firebaseAdministration.ts`, `scripts/firebase-transfer-owner.mjs` | Erhalt der Kontakte beim Geschäftsführerwechsel |
| `tests/firebase-data.test.ts`, `tests/firebase.integration.test.ts` | Daten-/API-/Repository-Regressionen |
| `scripts/firebase-payment-contacts-check.mjs` | Tatsächliche Migration mit künstlichen Emulator-Daten, Rechteprüfung, Abbruch/Resume |

Firebase Spark bleibt unterstützt. Es werden weder Cloud Functions noch ein Zahlungskonto benötigt. Das CLI-Werkzeug nutzt den vorhandenen `gcloud`-IAM-Zugang in Cloud Shell; keine privaten Schlüssel im Browser. Die bestehende Supabase-Version ist unverändert: ihre RPC-Ausgabe entfernt Kontakt-Snapshots bei fehlendem Abrechnungsrecht bereits seit Migration 003. Es ist für diese Phase kein neues Supabase-SQL nötig.

## Kontrollierte Veröffentlichung

Vorbereitung: Wartungsfenster vereinbaren. Geschäftsführer-/Firmenzuordnung prüfen. Version 6.4.1 aus dem Branch `firebase-spark` beziehen. Die bisherige Supabase-Site nicht überschreiben. Alte App-Tabs/PWA-Clients müssen nach Veröffentlichung aktualisiert werden; alte Clients mit Kontaktfeldern in Zahlungsdaten erhalten bewusst keine Schreibfreigabe mehr.

1. Build prüfen: `npm ci`, `npm run build:firebase`, Ausgabe `dist-firebase`.
2. Hosting-Site in `firebase.parallel.json` prüfen: Testsite `heimfriseur-test-237368331242`, Projekt `heimfriseur-dayplayer100`.
3. Neue Firestore-Regeln installieren. Dadurch werden Altbestände ohne Schema-Marker für operative Mitarbeiter-Lesezugriffe gesperrt.
4. Pro bestehendem Unternehmen zunächst den Dry-Run ausführen. `FIRMEN_ID` durch die tatsächliche Firestore-Dokument-ID unter `hf_businesses` ersetzen, nicht durch eine E-Mail.
5. Anschließend genau dieses Unternehmen mit `--apply` migrieren. Neue Regeln müssen vorher aktiv sein, damit die Migrationssperre und der Schutz der Zielcollection gelten.
6. Neue Firebase-Website veröffentlichen, Clients aktualisieren und Rollenprüfung durchführen. Mitarbeiterrechte nur auf einen benötigten Heim-Scope begrenzen.

```bash
# Regeln, ohne die Hosting-Site zu verändern:
npx --yes --package firebase-tools@15.32.1 firebase deploy --only firestore:rules --config firebase.parallel.json --project heimfriseur-dayplayer100

# Erst prüfen – keine Datenänderung:
node scripts/firebase-migrate-payment-contacts.mjs --project heimfriseur-dayplayer100 --business FIRMEN_ID

# Danach anwenden – geschützte Sicherung vor Kontaktbereinigung:
node scripts/firebase-migrate-payment-contacts.mjs --project heimfriseur-dayplayer100 --business FIRMEN_ID --apply

# Firebase-Testwebsite veröffentlichen; Hosting-Site vorher prüfen:
npx --yes --package firebase-tools@15.32.1 firebase deploy --only hosting --config firebase.parallel.json --project heimfriseur-dayplayer100
```

## Sicherung, Abbruch und Wiederaufnahme

Standardordner: `~/.heimfriseur-backups/`, Ordnerrechte 0700, JSON-Dateirechte 0600.
`--backup-dir` darf einen anderen privaten Ordner außerhalb des Repositorys angeben.
Die Sicherung enthält personenbezogene Daten: nicht hochladen, nicht an Mitarbeiter verteilen und nicht in Git einchecken. Die Ausgabe enthält nur Pfad, Hash und Anzahl, keine Kontaktinhalte oder Zugangstokens.

Vor dem ersten Kontakt-/Datensatzwechsel wird der gesperrte Originalbestand inklusive Revision, operativen Datensätzen und geschützten Zielbeständen gesichert. Je Kontakt erfolgt Übertragung und Entfernung der alten Felder in derselben Firestore-Commit-Operation; Batches bleiben auf 200 Schreiboperationen begrenzt. Ein bereits vorhandener abweichender Snapshot wird niemals überschrieben. Unveränderte Finanzdokumente werden nicht beschrieben. Vor Freigabe werden sämtliche originalen operativen Datensätze (abzüglich der absichtlich entfernten Kontaktfelder) und alle übertragenen Kontakte verglichen. Die Firmenrevision wird erhöht, damit Clients ihre Caches neu laden.

Bei Fehler: Firma bleibt gesperrt. Fehlerursache prüfen, gegebenenfalls widersprüchliche Datensätze anhand der Sicherung klären. Danach:

```bash
node scripts/firebase-migrate-payment-contacts.mjs --project heimfriseur-dayplayer100 --business FIRMEN_ID --apply --resume
```

Resume überschreibt keine fremde laufende Migration. Die Sicherung ist ein geschützter Snapshot, kein automatischer zeitpunktgenauer Gesamt-Firebase-Restore; die vollständige Wiederherstellungsprobe bleibt Aufgabe von Phase 5.

## Abnahme

- [ ] Geschäftsführung sieht historische Rechnungsempfänger weiterhin korrekt.
- [ ] Mitarbeiter ohne `view_billing` sehen Zahlungsstatus, aber weder Namen noch Adressen über UI oder API.
- [ ] Mitarbeiter mit `view_billing` können nur innerhalb ihres Heim-Scopes lesen; Änderungen erfordern die Besuchszuweisung.
- [ ] Statusänderung durch Mitarbeiter ohne Abrechnungsrecht erhält den geschützten Snapshot.
- [ ] Direkte API-Injektion der Kontaktfelder in operative Zahlungsdaten wird abgewiesen.
- [ ] Migration entfernt alle alten Kontaktfelder und erhält Status, Beträge und sonstige Fachdaten.
- [ ] Sicherung ist privat, Inhaltvergleich erfolgreich, Firmenmarker erst danach freigegeben.
- [ ] Konflikt führt zu Sperre; kontrollierte Wiederaufnahme funktioniert.
- [ ] Clients zeigen Version 6.4.1; Google-/E-Mail-Provider und weitere Audit-Phasen sind separat zu prüfen.

Die Phase-1-Tests laufen automatisch unter `npm run test:firebase`. Die historischen Audit-Proben unter `audit/` dokumentieren Stand 6.4.0 und erwarten teilweise unsichere Zugriffe; sie sind keine aktuellen grünen Regressionstests. Das neue Phase-1-Verhalten wird durch die oben genannten Tests geprüft.
