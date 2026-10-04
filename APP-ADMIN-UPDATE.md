# HeimFriseur 4.0 – App-Admin

App-Admins können jedes vorhandene Unternehmen auswählen und dort die vorhandenen Geschäftsführerfunktionen nutzen: Einrichtungen, Wohnbereiche, Kunden, Leistungen, Heimpreise, Termine, Behandlungen, Abrechnung, Berichte, Feedback und Teamrechte. Die Rolle ist zusätzlich zu den bestehenden Unternehmensrollen. Geschäftsführer und Mitarbeiter behalten ihren bisherigen Zugang und ihre Daten.

## Einmal einrichten

1. Das gewünschte Admin-Konto unter der vorhandenen HeimFriseur-Website registrieren und seine E-Mail bestätigen. Ein bestehendes bestätigtes Konto kann ebenfalls genutzt werden.
2. In Supabase die **Migration `supabase/migrations/004_app_admin.sql` einmal** ausführen. 001, 002 und 003 müssen bereits vorhanden sein; bereits ausgeführte Migrationen nicht wiederholen. Bei einer neuen Datenbank 001–004 in dieser Reihenfolge einrichten.
3. Im Supabase SQL-Editor eine neue Abfrage ausführen; den Platzhalter durch die registrierte Admin-Adresse ersetzen:

```sql
select public.bootstrap_app_admin('DEINE_ADMIN_EMAIL');
```

Dieser Einstieg ist ausschließlich für den Datenbankbetreiber über SQL erreichbar. Normale Geschäftsführer und Mitarbeiter können die Funktion nicht aus der App aufrufen. Es wird nur die exakt benannte, bestätigte Adresse aktiviert; keine automatische Zuweisung an den ersten beliebigen Nutzer.

4. Vorhandene Firebase-Website aktualisieren:

```sh
cd ~/heimfriseur
git pull --ff-only
npm ci
npm run build
npx firebase-tools deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

Build-Ausgabe: `dist`. URL: `https://heimfriseur-app.web.app`. Die bestehende öffentliche Supabase-Verbindung und `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` bleiben unverändert. Keine zusätzlichen geheimen Frontend-Schlüssel erforderlich. Lokaler Quellcode und GitHub sind aktualisiert; die produktive Migration und Veröffentlichung erfolgen im eigenen angemeldeten Projekt.

## Benutzung

Mit dem aktivierten Konto anmelden. Der Bereich **App-Admin** zeigt alle Unternehmen mit Geschäftsführeradresse. Ein Unternehmen auswählen; anschließend gelten die bekannten Geschäftsführerfunktionen für genau dieses Unternehmen. Der aktuelle Unternehmensname bleibt oben sichtbar. „Unternehmen auswählen“ ohne Auswahl kehrt zur App-Verwaltung zurück.

Weitere bestätigte App-Konten unter **Einstellungen → App-Admin** als Admin hinzufügen, aktivieren oder deaktivieren. Der letzte aktive App-Admin kann nicht deaktiviert werden. Die App-Admin-Rolle verändert nicht automatisch die Geschäftsführerrolle eines Kontos oder die technische Eigentümer-ID bestehender Daten. Ein Konto kann seine bisherige Unternehmensrolle behalten und zusätzlich App-Admin sein. Ein Entzug der Adminrolle entfernt die globalen Rechte; eine eventuell zuvor vorhandene normale Unternehmensrolle bleibt bestehen.

Der Datenbankbetreiber kann mit der Vorlage `supabase/admin-bootstrap.sql` zusätzlich die bestehende Geschäftsführerrolle kontrollieren. Sie enthält bewusst Platzhalter; echte Konto-E-Mail-Adressen und Passwörter sind nicht im veröffentlichten Quellcode hinterlegt.

## Grenzen und Absicherung

Die Rolle verwaltet die HeimFriseur-Anwendungsdaten und Zugänge. Sie ersetzt keinen Firebase-/Supabase-Projektadministrator und liefert keine privaten Schlüssel oder Zugriff auf Infrastruktur. Supabase-Auth-Konten werden weiterhin regulär registriert; fremde Passwörter werden nicht angezeigt oder über die App gesetzt. Historische Behandlungsschutzregeln bleiben erhalten: eine fremde laufende Behandlung wird zuerst bewusst übernommen, abgeschlossene Behandlungen werden über die protokollierte Korrektur geändert.

Die Unternehmensauswahl wird pro Browser-Tab gespeichert und als Kontext an jede Datenbankanfrage übermittelt. Die Datenbank prüft bei jedem Zugriff den tatsächlich angemeldeten Nutzer und die geschützte Admin-Tabelle. Der Header alleine gewährt keine Rechte. Ohne Auswahl werden keine Unternehmensdaten geladen; bei ausgewähltem Unternehmen liefern RLS und Funktionen ausschließlich dessen Daten. Normale Nutzer können über einen manipulierten Header nicht auf fremde Unternehmen zugreifen.

Unternehmenswechsel sichern offene Änderungen vor dem Neuladen. Eine eigene laufende Behandlung muss vorher beendet werden; andere Mitarbeiter können währenddessen weiterarbeiten. Beim Abmelden wird die Auswahl entfernt. Administrative Datenänderungen sowie Vergabe/Entzug von Adminrechten werden protokolliert; interne Kundenangaben werden nicht in zusätzliche Audit-Snapshots kopiert. Admin-Behandlungen speichern die tatsächliche ausführende Person, ohne das Konto in andere Unternehmen zu verschieben.

## Tests

47 automatisierte Tests einschließlich sechs App-Admin-Datenbanktests prüfen die vollständige Migrationskette, expliziten Bootstrap, Rechtevergabe, Isolation und manipulierte Header, Behandlungen/Zahlungen im ausgewählten Unternehmen, echte Urheberschaft, getrennte Einführung, geschützten letzten Admin und Entzug des Zugangs. Die Browserintegration prüft zusätzlich Anmeldung als Admin, Auswahl, Stammdatenbearbeitung ohne Eigentümerwechsel und Vergabe eines weiteren Adminzugangs. Bestehende Workflow-, Team-, OCR-, PDF- und PWA-Prüfungen bleiben erhalten. Eine Prüfung mit den echten Konten erfolgt nach der produktiven Einrichtung.
