# HeimFriseur 2.0 – Team-Erweiterung

## Entwicklungsstand

Implementierte Erweiterung der bestehenden App, kein Neustart und keine neue Datenbank.
React/TypeScript/Vite, Supabase Auth/PostgreSQL, Firebase Hosting und PWA bleiben erhalten.
Die Erweiterung muss zusammen mit Migration `002_team.sql` installiert werden. Die Ausführung im echten Projekt und das Firebase-Deployment sind hier nicht automatisch erfolgt.

## Rechte

| Funktion | Geschäftsführer | Mitarbeiter |
|---|---|---|
| Unternehmensdaten, Einrichtungen, Gruppen, Kunden, Leistungen | Lesen und verwalten | Benötigte Daten aus zugewiesenen Wohnbereichen lesen |
| Vertrauliche Einrichtung-/Gruppen-/Kundennotizen | Ja | Nein |
| Besuche planen, verschieben, absagen, löschen, zuweisen | Ja | Nein |
| Zugewiesene Besuche bearbeiten | Alle Unternehmensbesuche | Nur zugewiesene Besuche |
| Vorhandenen Kunden aus dem Besuchswohnbereich hinzufügen | Ja | Ja |
| Neuen Kunden anlegen | Ja | Nein |
| Behandlung starten, Leistungen, Material, Arbeitsnotizen, Rezeptur | Ja | Eigene Behandlung in zugewiesenem Besuch |
| Laufende Behandlung eines Kollegen ändern | Nur nach protokollierter Übernahme | Nein |
| Endpreis manuell überschreiben | Ja | Nein |
| Eigene Behandlungspreise sehen | Ja | Ja |
| Fremde Behandlungsbeträge, Unternehmensauswertungen, PDF-Berichte | Ja | Nein |
| Besuch abschließen | Ja | Nur wenn als verantwortlich zugewiesen |
| Historische Endpreise/Material korrigieren | Mit Begründung und Protokoll | Nein |
| Einladen, deaktivieren, reaktivieren | Ja | Nein |
| JSON-Datenexport | Ja | Nein |

Mitarbeiter erhalten ausschließlich die auf den Besuch begrenzte Datenantwort aus `employee_snapshot()`. Die bisherigen Haupttabellen bleiben per RLS für Mitarbeiter unlesbar; vertrauliche Notizen werden serverseitig entfernt. Weitere Behandlungshistorie und Farbrezepturen stehen für Kunden der zugewiesenen Wohnbereiche zur Verfügung. Die Preisliste ist für die Leistungsauswahl sichtbar. Beträge anderer Mitarbeiter werden in der Antwort entfernt. Der Hauptdatensatz `user_id` bleibt aus Kompatibilitätsgründen beim ursprünglichen Unternehmensinhaber; `business_id`, Zuweisung und aktive Mitgliedschaft bestimmen den Zugriff. `performed_by` hält die ausführende Person fest, `created_by` die Erstellung von Termin bzw. Behandlung.

Es gibt einen Geschäftsführer pro Unternehmen, keine frei konfigurierbaren Rollen und keine Möglichkeit zur Selbstbeförderung. Ein Konto gehört genau zu einem Unternehmen. Bestehende Unternehmerkonten werden nicht in ein anderes Unternehmen verschoben: für Mitarbeiter einen separaten Zugang verwenden. Keine Lohnabrechnung, Mitarbeiterüberwachung oder Ranglisten.

## Einladungen

1. Einstellungen → Team → E-Mail eintragen → Einladungslink erstellen.
2. Link kopieren und selbst an den Mitarbeiter schicken. Die App behauptet nicht, Einladungsmails zu versenden.
3. Mitarbeiter öffnet den Link, registriert die eingeladene Adresse bzw. meldet sich damit an und bestätigt die E-Mail.
4. Nach E-Mail-Bestätigung den Einladungslink nötigenfalls erneut öffnen, Namen eingeben und annehmen.
5. Geschäftsführer öffnet einen Besuch → Team zuweisen. Eine oder mehrere Personen auswählen, optional eine verantwortliche Person für den Abschluss.

Tokens enthalten zwei zufällige UUIDs, stehen nur einmal im zurückgegebenen Link und werden in der Datenbank als SHA-256-Hash gespeichert. Einladung läuft nach sieben Tagen ab, kann widerrufen werden und ist nur mit der passenden bestätigten E-Mail-Adresse einlösbar. Einladungslinks nicht öffentlich teilen. Die Supabase Auth-E-Mail-Bestätigung benötigt die bestehende Supabase-E-Mail-Konfiguration; keine neue Mail-Infrastruktur nötig. Die vorhandene Site URL `https://heimfriseur-app.web.app` und Redirect URL `https://heimfriseur-app.web.app/**` weiter verwenden.

## Besuche und Behandlung

Neue Besuche sind zuerst dem Geschäftsführer zugewiesen. Ein Folgebesuch übernimmt die noch aktiven Zuweisungen und Verantwortlichkeit. Besuche ohne aktives Team erscheinen im Geschäftsführer-Dashboard.

Je Mitarbeiter kann nur eine Behandlung laufen; pro Kunde ebenfalls nur eine im Unternehmen. Dies wird durch Datenbankindexe und transaktionale RPCs abgesichert. Unterschiedliche Kunden können parallel behandelt werden. Die Oberfläche lädt den gemeinsamen Fortschritt alle 15 Sekunden nach, außerdem beim erneuten Öffnen des Browserfensters. Das Sperren eines Zugangs wirkt sofort auf neue Datenbankanfragen; bereits sichtbare Daten verschwinden beim nächsten Aktualisieren. Historie wird nicht gelöscht.

Bei Ausfall eines Mitarbeiters kann der Geschäftsführer dessen offene Behandlung im Besuch nach Bestätigung übernehmen; der bisherige Bearbeiter kann sie danach nicht mehr ändern. Der ursprüngliche Ersteller bleibt erhalten und die Übernahme wird protokolliert. Vor der Übernahme mit dem Mitarbeiter abstimmen, damit kein noch laufender Eingabestand übergangen wird.

Behandlungseingaben werden nach etwa 900 ms ohne weitere Eingabe gespeichert, mit Statusanzeige und manueller Wiederholung. Speicheranfragen laufen nacheinander. Neuere Eingaben werden nicht durch eine ältere Antwort als gespeichert markiert. Navigation wartet auf die Speicherung; bei einem Fehler bleibt die Ansicht geöffnet. Das Beenden wartet auf ältere Anfragen und speichert den aktuellen Stand atomar. Bei Neuladen/Schließen mit ungespeicherten Daten greift zusätzlich der Browserhinweis, soweit der Browser ihn unterstützt. Auf Smartphones kann das Betriebssystem einen Browser ohne Hinweis beenden: bei fehlender Verbindung die Ansicht offen lassen. Keine vollständige Offline-Synchronisation.

Abgeschlossene Leistungssnapshots werden nicht verändert. Der Geschäftsführer kann den tatsächlichen Endpreis und Materialkosten mit Begründung korrigieren; alte/neue Werte und Person/Zeit stehen im Änderungsprotokoll.

## Auswertungen und PWA

Personenfilter gilt für abgeschlossene Behandlungen, Umsatz und Material. Besuchsdauer und Besuchszahl bleiben Unternehmenswerte des gewählten Zeitraums und werden nicht mit der Anzahl zugewiesener Mitarbeiter multipliziert. Bei Personenfilter heißt der Stundensatz ausdrücklich Umsatz pro Behandlungsstunde. Individuelle Arbeitszeiten werden nicht aus Zuweisungen erfunden. Bei einer übernommenen Behandlung wird die gesamte Behandlungsdauer dem abschließenden Bearbeiter zugerechnet; die vorherige Person bleibt im Übernahmeprotokoll und als Ersteller erhalten. Getrennte Zeitabschnitte pro Bearbeiter werden nicht erfasst. PDFs bleiben Geschäftsführerberichte mit notwendigen Besuchsdaten, ohne interne Notizen oder Farbrezepturen.

App-Updates zeigen eine Schaltfläche und aktualisieren nicht automatisch während einer Behandlung. Installation vom Browser bleibt erhalten. Ein Unternehmensdatenexport als JSON ist unter Einstellungen → App verfügbar. Er enthält Geschäftsdaten und Teamprotokoll, keine Auth-Schlüssel. Die Exportdatei enthält personenbezogene Daten und gehört in einen geschützten Speicher. Dieser Export ist kein Ersatz für eine vollständige PostgreSQL-Sicherung; ein automatischer Import ist bewusst nicht implementiert.

## Aktualisierung des bestehenden Projekts

### 1. Sicherung und Vorbereitung

- Vor Live-Migration Datenbank vollständig sichern. Je nach Supabase-Tarif eine vorhandene Datenbanksicherung prüfen oder über Supabase CLI eine Schema- und Datensicherung erstellen und geschützte Dateien verwahren. Passwörter/Verbindungsdaten nicht ins Repository einchecken.
- Auf einer separaten Testdatenbank zuerst `001_heimfriseur.sql`, danach `002_team.sql` prüfen; die lokalen PostgreSQL-Tests prüfen denselben Weg mit fiktiven Daten.
- Kurzzeitig keine laufenden Behandlungen oder gleichzeitig offenen Schreibvorgänge im Live-Projekt. Ein ruhiges Zeitfenster wählen.
- Die Migration ist eine einzige Transaktion. Wenn sie fehlschlägt, wird nichts davon committed. SQL-Fehler beheben, statt Tabellen zu löschen.

### 2. Datenbank aktualisieren

Im Supabase SQL Editor des bestehenden Projekts **nur** `supabase/migrations/002_team.sql` ausführen.
`001` wurde bereits installiert und darf nicht erneut ausgeführt werden. Die Migration erzeugt pro bestehendem Profil ein getrenntes Unternehmen mit aktivem Geschäftsführer und weist dessen bestehende Besuche ihm zu. Kundendaten, Zeiten, Preise, IDs und historische Beziehungen bleiben erhalten. Die Migration ist einmalig; nicht wiederholt auf einer bereits aktualisierten Datenbank ausführen.

### 3. Website aktualisieren

In der vorhandenen Google Cloud Shell:

```bash
cd ~/heimfriseur
git pull --ff-only
npm ci
npm test
npm run build
npx --yes firebase-tools deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

`firebase.clean.json` veröffentlicht weiterhin auf `https://heimfriseur-app.web.app`. Kein neues Firebase-Projekt erforderlich. Der manuelle GitHub-Deploy-Workflow verwendet ebenfalls die saubere Hosting-Site und benötigt ein schon eingerichtetes `FIREBASE_SERVICE_ACCOUNT`-Secret. Er startet nicht automatisch.

Build: `npm run build`. Ausgabe: `dist`. Optional: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` als öffentliche Build-Variablen; vorhandene öffentliche Projektkonfiguration bleibt als Fallback erhalten. Keine Service-Role-Schlüssel in der App.

### 4. Nachprüfung

Als bestehender Geschäftsführer anmelden, Daten und Preishistorie prüfen. Einen separaten Mitarbeiter einladen; mit dessen bestätigtem Konto einen zugewiesenen Besuch öffnen. Nicht zugewiesenen Besuch und Auswertung müssen unzugänglich sein. Testbehandlung mit Autosave, Timer/Neuladen, Abschluss, Folgetermin und PDF durchspielen. Mitarbeiter deaktivieren und den erneuten Datenabruf testen.

### Wiederherstellung bei Fehlern

Vorhandenes Firebase-Release kann in der Firebase-Konsole auf die vorherige Version zurückgesetzt werden. Das alte Frontend bleibt für ursprüngliche Geschäftsführer durch die beibehaltenen IDs, Eigentümerfelder und RPC-Signaturen mit Migration 002 nutzbar; Mitarbeiter dürfen nur die neue Oberfläche benutzen. Die neue Oberfläche erfordert Migration 002 und zeigt bei fehlender Migration einen Einrichtungsfehler. Keine automatische destruktive Rückmigration. Bei Datenbankproblemen Sicherung in einer separaten Datenbank wiederherstellen und vergleichen, anschließend gezielt reparieren; keine Teamtabellen mit historischen Fremdschlüsseln blind löschen.

## Prüfungen

```bash
npm run check
npm test
npm run build
# Entwicklungsserver in einem anderen Terminal: npm run dev
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:team-browser
```

Ohne vorhandenes Chromium: `npx playwright install chromium` und `CHROMIUM_PATH` weglassen. Die 27 lokalen Tests prüfen Datenmodell, Migration, Rechte und Kernberechnungen. Die Team-Browserprüfung verwendet die echten Migrationen in einer wegwerfbaren PGlite-Datenbank und lokal abgefangene Supabase-HTTP-Aufrufe. Sie berührt das Live-Projekt nicht. Auth-E-Mail-Versand, echte Supabase-Konfiguration und tatsächliche Smartphone-Installation benötigen anschließend eine Prüfung auf dem Zielsystem. Ein vollständig paralleler Mehrverbindungstest ist zusätzlich sinnvoll; PGlite stellt für diese Tests eine einzelne Verbindung bereit, während die Datenbank constraints/Transaktionssperren schon geprüft werden.
