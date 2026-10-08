# HeimFriseur: Phasen 2–5 und Freigabe

Ziel bleibt das kostenlose Firebase-Spark-Projekt `heimfriseur-dayplayer100`, ausschließlich Testsite `heimfriseur-test-237368331242`. Keine kostenpflichtigen Functions; clientseitige Transaktionen werden durch serverseitige Firestore-Regeln überprüft. Ein bestandener lokaler Test ersetzt keinen Live- oder Mobilgeräte-Test.

## Sicherheitswirkung

- **Phase 2:** Jeder offene/laufende Besuchskunde muss in einem von sechs geschützten Prüfdokumenten registriert sein. Entfernen verlangt atomar einen erledigten/übersprungenen Kunden. Ein Besuch kann nur bei sechs leeren Prüfdokumenten abgeschlossen werden. Behandlungsende verlangt plausible Millisekunden, erledigten Kunden, passenden Finanzabschluss und freigegebene Mitarbeiter-/Kundensperren in derselben Transaktion. Auch Geschäftsführer können diese Prüfungen nicht umgehen.
- **Phase 3:** Firestore speichert Geld als ganzzahlige Centwerte; Euro werden ausschließlich an der Oberfläche verwendet. Firmenbesitzer und aktive Geschäftsführerrolle sind atomar gekoppelt. Pro Firma kann nur die im Firmenkopf genannte Person Geschäftsführer sein. Audit-Einträge sind unveränderlich, verwenden Serverzeit und verweisen auf eine tatsächlich geänderte Fachakte samt Transaktionsrevision. Mitarbeiter können keine separaten oder privilegierten Ereignisse erfinden. Abfragen erfolgen in Seiten mit 200 Dokumenten und maximal 10.000 geladenen Datensätzen, Protokollanzeige maximal 200 letzte Ereignisse. Bei Sitzungswechsel/Fehler werden Anwendungscaches verworfen.
- **Phase 4:** Supabase-Hosting und Firebase-Testversion haben getrennte Workflows. Der Firebase-Publish-Workflow ist manuell, auf `firebase-spark` und die bestehende Testsite beschränkt. Er veröffentlicht nur Hosting; Regeln werden im Wartungsfenster zusammen mit den Migrationen eingespielt. CI prüft Regressionen, Emulator und mobile Browseransicht.
- **Phase 5:** Betreiberwerkzeug prüft Rollen/aktive Kontozuordnungen und erzeugt mit Wartungssperre eine private Firestore-Sicherung (0700/0600, SHA-256). Wiederherstellung ist ausschließlich in einem Demo-Emulator erlaubt und vergleicht jedes Dokument. Auth-Nutzer/Passworthashes gehören nicht zu dieser Firestore-Sicherung.

## Bewusste Grenzen

Behandlungsleistungsauswahl maximal vier Leistungen: So bleiben Preisprüfung und atomare Fachtransaktionen innerhalb der Firestore-Regellimits. Große Kundenlisten werden beim Planen in kleinen, wiederaufnehmbaren Schritten angelegt. Bis „Planung vervollständigen“ erfolgreich war, sind Behandlung und Besuchsabschluss gesperrt. Abschluss und Folgeplanung sind getrennte Schritte; fehlgeschlagene Folgeplanung lässt sich wiederholen, ohne den bereits abgeschlossenen Besuch erneut zu verändern.

Die Firmenrevision serialisiert Fachänderungen; bei Paralleländerungen neu laden und wiederholen. Das Audit beweist die primäre Fachänderung, nicht eine vollständige serverseitig generierte Ereignisliste jedes einzelnen Feldes. Betreiber mit Google-IAM-Zugang umgehen Firestore-Clientregeln: Keine parallelen Betreiberänderungen während Migration/Sicherung. Bei Prozessabbruch während Sicherung bleibt das Wartungsfenster gegebenenfalls aktiv; Betreiber muss Ursache prüfen. Keine öffentlichen Backups oder Service-Account-Dateien im Repository.

## Live-Reihenfolge (Google Cloud Shell Terminal)

Zuerst **PHASE-1-LIVE.md** vollständig durchführen. Echte Firmen-ID muss zu T-cut gehören, nicht aus einer E-Mail geraten werden. Alle Nutzer schließen die App während des folgenden Wartungsfensters. Quellcode-Stand und aktuelle Hosting-Site sichern, keine lokalen Änderungen überschreiben.

```bash
cd ~/heimfriseur-firebase/heimfriseur-firebase
git status --short
git fetch origin firebase-spark
git switch firebase-spark
git pull --ff-only origin firebase-spark
npm ci
read -r -p 'Aktive Unternehmens-Dokument-ID von T-cut: ' HF_BUSINESS_ID
node scripts/firebase-list-businesses.mjs --project heimfriseur-dayplayer100
node scripts/firebase-migrate-workflow.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID"
```

Dry-Run-Bericht prüfen. Inkonsistente Altdaten werden nicht still korrigiert. Neue Regeln vor Freigabe der migrierten Firma installieren; sie blockieren operative Altformat-Schreibzugriffe.

```bash
npx --yes --package firebase-tools@15.32.1 firebase deploy --only firestore:rules --config firebase.parallel.json --project heimfriseur-dayplayer100
node scripts/firebase-migrate-workflow.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID" --apply
node scripts/firebase-migrate-finance.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID"
node scripts/firebase-migrate-finance.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID" --apply
node scripts/firebase-backup.mjs --project heimfriseur-dayplayer100 --business "$HF_BUSINESS_ID" --apply
npm run build:firebase
node --input-type=module -e 'import fs from "node:fs";const p="firebase.parallel.json";const c=JSON.parse(fs.readFileSync(p,"utf8"));c.hosting.site="heimfriseur-test-237368331242";fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n");'
npx --yes --package firebase-tools@15.32.1 firebase deploy --only hosting --config firebase.parallel.json --project heimfriseur-dayplayer100
```

Migration bleibt bei Konflikt/Abbruch gesperrt. Ursache beheben und ausschließlich das betroffene Skript mit `--apply --resume` wiederholen. Keine Sperrmarker manuell löschen und kein `--resume` auf eine andere Migration anwenden. Sicherungspfade/Hashes privat dokumentieren. Für mehrere aktive Firmen alle zu erhaltenden Firmen separat migrieren.

## Ausfüllbare Freigabe-Checkliste

Datum/Prüfer: __________  Commit/Version: __________  Firmen-ID: __________

- [ ] Phase 1 live: Kontaktbereinigung und Mitarbeiterzugriff geprüft. Ergebnis: __________
- [ ] Phasen 2/3 live: Migrationen fertig, Sperren aufgehoben, exakt eine aktive Geschäftsführung. Ergebnis: __________
- [ ] T-cut ist Geschäftsführung, gewünschtes Administratorkonto separat berechtigt, Mitarbeiter ohne Umsatz/Auswertung/Abrechnung. Konten: __________
- [ ] Private Sicherung plus Hash verifiziert, Wiederherstellung im Emulator erfolgreich. Privater Ablageort: __________
- [ ] Android Chrome + installierte App: E-Mail-Registrierung, tatsächlicher Mailempfang, Linkbestätigung, Anmeldung, Passwortreset, Abmeldung. Gerät/Ergebnis: __________
- [ ] iPhone Safari + Home-Bildschirm: dieselben E-Mail-/Reset-Flows. Gerät/Ergebnis: __________
- [ ] Google-Anmeldung auf beiden Geräten, erlaubte Firebase-Auth-Domänen einschließlich Testsite, OAuth-Fehler/Abbruch verständlich. Ergebnis: __________
- [ ] Mitarbeiter: Einladung an exakt passende bestätigte E-Mail, erneute Annahme, widerrufener Link, falsches Konto, deaktiviertes Konto. Ergebnis: __________
- [ ] Direktzugriff auf fremde Firma, Kontakte und abgeschlossene Finanzdaten verweigert; Rollenentzug wirkt nach Neuladen. Ergebnis: __________
- [ ] Vollständiger Besuch: Start, Zwischenstand, Zahlung, Abwesenheit, Abschluss, Folgetermin, PDF, Parallelkonflikt/Verbindungsabbruch. Ergebnis: __________
- [ ] Browser und installierte App zeigen denselben freigegebenen Versionsstand; alte Sitzung/Cache enthält keine Fremdfirmendaten. Ergebnis: __________
- [ ] Datenschutzinformationen, Zugriffskonzept, Lösch-/Aufbewahrungsprozess und Verträge für echte Kundendaten geprüft. Verantwortlich: __________

**Freigabe echte Kundendaten:** noch offen. Entscheidung/Verantwortlicher/Datum: __________
