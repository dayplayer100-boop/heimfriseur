# HeimFriseur 5.0 – einfacher Arbeitsalltag

Dieses Update erweitert die bestehende App. Bestehende Kunden, Besuche, historische Preise und die tatsächliche Geschäftsführung bleiben erhalten.

## Was geändert wurde

- Der App-Ersteller arbeitet im echten Unternehmen mit vollständigen Bearbeitungsrechten, ohne als Mitarbeiter hinzugefügt oder als Geschäftsführer eingesetzt zu werden. Ein leerer, früher automatisch angelegter eigener Admin-Betrieb wird in der Auswahl ausgeblendet, nicht gelöscht. Bei genau einem sichtbaren Betrieb wird dieser automatisch geöffnet. Bei mehreren Betrieben erfolgt die Auswahl in Einstellungen → App-Admin.
- Technische Änderungsprotokolle, Löschereignisse, Adminrechte und die Zusammenfassung der App-Version sind nur im Adminbereich erreichbar. Vorgänge bleiben intern nachvollziehbar. Die Geschäftsführung hat weiterhin volle Unternehmensrechte.
- Geschäftsführer werden einmal durch Unternehmensdaten, Heime, Gruppen, Kunden und Preise geführt. Vorhandene Einträge können bearbeitet werden. Schritte dürfen übersprungen werden. Wiederholen: Einstellungen → App → Unternehmen Schritt für Schritt einrichten.
- Einstellungen → Leistungen zeigt oben eine Heim-Auswahl mit einer vollständigen Preisliste. Die erste reale Einrichtung liefert Vorgabepreise für neue und noch nicht angepasste Listen. Sobald eine andere Liste selbst gespeichert wird, bleibt sie unabhängig. Bereits vorhandene explizite Heimpreise werden beim Update als angepasst behandelt. Alte Behandlungssnapshots werden niemals umgerechnet.
- Unter Einrichtungen → Gruppen und im Gruppendetail können Besuchsrunden angelegt und mehrere Kunden direkt zugeordnet werden. Bestehende nächste Kundentermine haben weiterhin Vorrang; eine Umstellung erfolgt im Kundenprofil.
- Termin hinzufügen ist auf dem Dashboard und im Kalender erreichbar. Nach Einrichtung und Gruppe kann ein einzelner Kunde ausgewählt werden. Einzelkundentermine sind zunächst einmalig; eine ausdrücklich gewählte Wiederholung übernimmt genau diesen Kunden in den Folgetermin. Inaktive Kunden und Kunden ohne Friseurwunsch werden nicht automatisch erneut aufgenommen. Ganze Heimbesuche behalten die fälligen Kundenrhythmen.
- Datum kann als Zahlenfolge, deutsches Datum oder über einen Kalender eingegeben werden. Uhrzeit wird als 0930 oder 09:30 mit Zahlentastatur eingegeben. Es gibt kein natives Uhr-Auswahlrad.
- Mitarbeiter sehen Dashboard, Kalender, Einrichtungen und Kunden ausschließlich im zugewiesenen Umfang. Auswertung und Umsatzkennzahlen auf dem Dashboard sind verborgen. Die Berechtigung „Zugewiesene Termine planen und verschieben“ erlaubt neue Termine nur innerhalb bereits zugewiesener Bereiche. Sie ist standardmäßig nicht erteilt. Unternehmenspreise und Adminrechte bleiben gesperrt.
- Die Auswertung enthält einen Kreis für Materialkosten und Umsatz nach Material mit echten gefilterten Werten. Weitere Betriebsausgaben werden nicht behauptet.
- Passwortfelder bleiben standardmäßig maskiert und unterstützen Autofill. Der gerade getippte Buchstabe erscheint für 0,8 Sekunden zusätzlich; vollständige Sichtbarkeit kann mit dem Augensymbol ein-/ausgeschaltet werden. Passwörter werden dafür weder protokolliert noch gespeichert.
- Hilfe & Feedback ist ein kleiner, gut antippbarer Kreis. Die Einführung bleibt jederzeit erreichbar.

## Bestehende Installation aktualisieren

1. **Nur wenn 001–004 bereits installiert sind:** `supabase/migrations/005_clear_workflows.sql` vollständig im Supabase SQL Editor in einer neuen Abfrage einmal ausführen. Keine alte Migration wiederholen. 005 ist eine Transaktion; bei einem Fehler wird nichts teilweise übernommen. Nicht nach erfolgreichem Lauf erneut starten.
2. In Cloud Shell im vorhandenen Projektordner:

```bash
cd ~/heimfriseur
git pull origin main
npm ci
npm run build
npx firebase deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

3. Website neu laden. Bereits installierte App ebenfalls schließen und öffnen. Während einer laufenden Behandlung zuerst den Zwischenstand speichern und die Behandlung beenden.
4. Mit Geschäftsführer und Mitarbeiter einmal praktisch anmelden: Assistent, Heimpreise, Kundentermin, Behandlung, Besuchsabschluss und PDF prüfen.

Bei einer neuen Datenbank 001, 002, 003, 004 und 005 in genau dieser Reihenfolge installieren. Den ersten Admin nur gezielt durch den bestehenden SQL-Bootstrap für ein registriertes bestätigtes Konto einrichten. 005 erteilt keine neue Adminrolle und ändert keine vorhandene Unternehmensinhaberschaft.

## Build und Grenzen

React, TypeScript und Vite; Supabase Auth/PostgreSQL/RLS; Firebase nur Hosting. Node.js ≥22. `npm ci`, `npm run build`; Ausgabe `dist`. Optionale öffentliche Browserkonfiguration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (auch Publishable-Key). Keine privaten Schlüssel oder Service-Role-Werte im Browser.

Tests: `npm test`, `npm run test:browser`, `npm run test:team-browser`, `npm run test:practical-browser`, `npm run test:clear-browser`. Browserprüfungen benötigen einen laufenden Preview-Server und Chromium/Playwright. GitHub CI prüft Build, SQL-Rechte und die mobilen Abläufe.

Die lokale Umsetzung und Testdatenbanken ersetzen keinen Live-Test mit den echten Konten. Das Update wird hier nicht ohne Firebase-/Supabase-Zugang im Live-Projekt ausgerollt. Internet bleibt zum Speichern erforderlich. Zahlungsdokumentation bleibt ohne automatischen Rechnungsversand. App-Versionen werden als beschriebener Änderungsstand angezeigt; eine automatisierte Historie externer Firebase-Deployments ist nicht enthalten.
