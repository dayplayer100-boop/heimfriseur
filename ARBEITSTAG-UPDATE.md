# HeimFriseur 6.0 – Arbeitstag und sichere Updates

## Neue Funktionen

- **Mein Arbeitstag:** Mitarbeiter sehen den ersten offenen heutigen Besuch, den nächsten offenen Kunden nach Besuchsreihenfolge und ihre laufende Behandlung. „Nächsten Kunden starten“ startet wirklich den Timer. Eine laufende Behandlung wird zuerst zum Fortsetzen angeboten. Für eine andere Reihenfolge kann die Besuchsliste geöffnet werden. Zugriff weiterhin nur auf zugewiesene Besuche.
- **Wochenplanung:** Im Kalender „Wochenplanung je Heim“ aufklappen. Heim und Woche auswählen. Fällige aktive Kunden werden nach ihrem regulären oder einmaligen Datum angezeigt. Mit „Auch später fällige Kunden anzeigen“ können Kunden vorgezogen werden. Bereits vergangene Wochen stellen Fälligkeit aus dem aktuellen Kundenstand dar, keinen historischen Kalenderzustand; die Besuchsliste enthält die tatsächliche Historie.
- **Einmalig ändern:** Datum und Uhrzeit wählen. Es wird ein einzelner Besuch angelegt. Die offene bisherige Runde wird als vorgezogen/verschoben markiert; andere ausdrücklich geplante spätere Besuche bleiben erhalten. Wiederholtes Speichern desselben Termins erzeugt keinen zweiten. Der normale nächste Termin wird separat erhalten; nach der Behandlung wird dieser Rhythmus weitergerechnet. Inaktive Kunden, Kunden ohne Friseurwunsch und laufende Behandlungen können nicht so eingeplant werden. Mitarbeiter brauchen die Planungsberechtigung und eine passende zugewiesene Gruppe. Ein bereits vorhandener Termin muss ihnen auch selbst zugewiesen sein; fremde Termine können sie nicht überschreiben.
- **Abwesenheit:** Krank/Nicht vor Ort und dann nächster Heimbesuch, normaler Rhythmus, eigenes Datum oder noch offen. Vorhandene passende künftige Heimbesuche haben beim Nachholen Vorrang; sonst wird der Heimrhythmus verwendet. Das Datum ist zunächst die Kundenfälligkeit, nicht automatisch ein neuer Einzelbesuch. Beim nächsten geplanten Heimbesuch werden fällige Kunden übernommen. Ein eigener Einzelbesuch kann in der Wochenplanung angelegt werden.
- **Zahlungsübersicht:** „Unbekannt“ ist ein echter Status. Übliche Zahlungsart und Rechnungsempfänger werden vorgeschlagen. Der Geschäftsführer kann offene/ungeklärte abgeschlossene Behandlungen nach Heim, Status und Kunde/Rechnungsempfänger filtern und eine Summe sehen. Zahlungen können später ergänzt werden. Es gibt weiterhin keinen automatischen Rechnungsversand und keine Teilzahlung/Kassenbuchführung.
- **Besuchsabschluss:** Offene Kunden und laufende Behandlungen verhindern den Abschluss. Fehlende Zahlungsangaben werden angezeigt, verhindern ihn aber nicht. Die Zahlung darf später ergänzt werden.
- **Rechtevorlagen:** Nur behandeln / Behandeln und Termine planen. Vorlagen lassen sich durch einzelne Rechte anpassen und werden erst nach Speichern aktiv. Die einfache Behandlungs-Vorlage erlaubt weder Abrechnungskontakte, Preisänderungen noch Besuchsabschluss; die Planungs-Vorlage enthält Planungs- und eigene Zahlungserfassung. Der Geschäftsführer kann verantwortlichen Mitarbeitern den Abschluss zusätzlich erlauben. Auswertung, Unternehmen und Teamverwaltung bleiben gesperrt.
- **Speicheranzeige:** Gespeichert, Änderungen noch nicht gespeichert, Wird gespeichert, Speichern prüfen oder Verbindung fehlt. Autosave wird nicht als Erfolg angezeigt, solange noch Änderungen ausstehen. Keine vollständige Offline-Bearbeitung.

## Website und installierte App aktualisieren

Website und PWA auf `https://heimfriseur-app.web.app` laden dieselbe Veröffentlichung. Es gibt kein separates APK und keinen separaten App-Release.

Jeder Build erhält einen eindeutigen Bezeichner, eine `version.json` und einen geänderten Service Worker. Die ausgelieferte Version wird oben angezeigt. Beim Öffnen, Zurückkehren und etwa jede Minute wird online auf Änderungen geprüft. Einstellungen → App → **Neue App-Version prüfen** löst eine manuelle Prüfung aus. **Neue Version laden** übernimmt eine verfügbare Veröffentlichung und lädt die App neu. Eine offene Behandlung muss zuerst beendet werden; Zwischenstände werden über die vorhandene Speicherprüfung geschützt. Bei offenen Formularen gibt es vor dem Neuladen eine Rückfrage, damit Angaben zuerst gespeichert werden können.

Eine bereits geöffnete alte Sitzung kann während einer Behandlung noch die alte Version zeigen. Offline lässt sich keine neue Version laden. Deshalb sind die Versionen nicht in jedem Moment zwangsweise gleich: Die neue Version wird gemeldet und sicher übernommen. Daten, Konto und Website-Adresse bleiben identisch.

Die alte V5-App muss nach der ersten Veröffentlichung dieses Updates einmal aktualisiert oder geschlossen und geöffnet werden. Danach stehen die neuen Prüf-/Update-Tasten zur Verfügung. Die bisherige Service-Worker-Update-Taste kann den Wechsel bereits anbieten.

## Einmal aktualisieren

1. Wenn 001–005 bereits installiert sind, den vollständigen Inhalt von `supabase/migrations/006_workday.sql` in einer **neuen Supabase-SQL-Abfrage** einmal mit Run ausführen. Ältere Migrationen nicht erneut ausführen.
2. In Cloud Shell:

```bash
cd ~/heimfriseur
git pull origin main
npm ci
npm run build
npx --yes --package firebase-tools firebase deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

3. Website und installierte App neu öffnen. Mit Geschäftsführer und Mitarbeiter einmal Arbeitstag, Abwesenheit, Nachholtermin, Zahlung und Abschluss praktisch prüfen.

Bei neuer Datenbank 001 bis 006 in Reihenfolge. Die Migration ist eine Transaktion und löscht keine historischen Behandlungen. Sie ändert keine Geschäftsführung oder Adminzuordnung. Ein einmaliger Kundenwechsel und ein Besuchswechsel der gesamten Serie sind weiterhin getrennte Aktionen.

## Entwicklung und Prüfung

Node ≥22, React/TypeScript/Vite, Supabase Auth/PostgreSQL/RLS, Firebase Hosting. `npm ci`, `npm run build`, Ausgabe `dist` einschließlich Version und Service Worker. Optionale öffentliche Variablen: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Publishable-/Anon-Key). Keine privaten Schlüssel im Browser.

`npm test` prüft auch die Migration 006, Rhythmuserhalt, keine doppelten Nachholtermine, Zahlungsstatus und Mitarbeiterrechte. Browserprüfungen: `test:browser`, `test:team-browser`, `test:practical-browser`, `test:clear-browser`, `test:workday-browser`; zusätzlich Installation/PWA. Die neue Browserprüfung simuliert die Veröffentlichung einer anderen Versionskennung und prüft den sicheren Reload mit gespeicherten Daten. Die echte OS-Installation und der neue Live-Datenbankablauf sind anschließend auf dem Gerät zu prüfen.

Die Umsetzung verändert hier kein Firebase-/Supabase-Live-Projekt ohne vorhandenen Zugang. GitHub enthält den Quellcode und führt die Prüfungen aus; die obigen Schritte veröffentlichen ihn im bestehenden Projekt.
