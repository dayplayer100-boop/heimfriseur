# HeimFriseur 3.0 – Alltag im Heim

Diese Version erweitert die vorhandene Team-App. Die bestehende URL, Konten und historischen Behandlungen bleiben erhalten. Der Quellcode wird veröffentlicht; die produktive Datenbank-Migration und das Firebase-Deployment müssen im eigenen angemeldeten Projekt erfolgen.

## Einmal aktualisieren

1. Eine aktuelle Datenbanksicherung im eigenen Supabase-Projekt anlegen.
2. Wenn Team-Version 2 noch nicht eingerichtet ist: `supabase/migrations/002_team.sql` einmal im Supabase SQL-Editor ausführen. Bereits ausgeführte Migrationen nicht wiederholen.
3. Anschließend **`supabase/migrations/003_practical_workflow.sql` einmal** ausführen. Sie läuft in einer Transaktion und löscht keine bestehenden Kunden, Termine oder Behandlungen. **001 nicht erneut ausführen.**
4. In der Google Cloud Shell im vorhandenen Projektordner:

```sh
cd ~/heimfriseur
git pull --ff-only
npm ci
npm run build
npx firebase-tools deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

Der Build-Ausgabeordner ist `dist`. Die Hosting-Site bleibt `heimfriseur-app`, die Adresse `https://heimfriseur-app.web.app`. Den angezeigten Update-Hinweis nach Ende einer laufenden Behandlung bestätigen. Nicht während einer ungesicherten Behandlung aktualisieren.

Benötigte öffentliche Browser-Konfiguration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (akzeptiert auch einen Publishable-Key). Die bereits konfigurierte öffentliche Verbindung in `src/deployment.ts` dient als Fallback. Keine Service-Role-, privaten Firebase- oder Datenbank-Schlüssel im Frontend hinterlegen.

## Wohnbereiche und fehlende Angaben

Kunden können ohne bekannten Namen, Heim oder Wohnbereich gespeichert werden. Fehlende Zuordnungen erhalten eine eigene „Einrichtung noch offen“ beziehungsweise „Allgemein / später zuordnen“. Diese Datensätze können später vollständig zugeordnet werden. Angelegte Kunden behalten immer gültige Datenbankverknüpfungen. Es wird keine scheinbare Kundendaten-Angabe erfunden: der sichtbare Platzhalter ist „Name noch offen“.

Die Wohnbereichsliste aktualisiert sich beim Wechsel des Heims. Ein Besuch kann für alle Wohnbereiche eines Heims geplant werden. „Besuch planen“ in einem Heim öffnet genau dieses Heim, auch wenn es noch keine Wohnbereiche besitzt. Preis- und Intervallgrenzen sowie E-Mail-/Login-Prüfungen bleiben erforderlich, um ungültige Daten zu verhindern.

## Heimpreise

**Einrichtungen → Heim öffnen → Preise & Runden**: Für jede Leistung kann ein abweichender Heimpreis gespeichert werden. Leeres Feld und Speichern stellt die allgemeine Preisliste wieder her. Beim Start beziehungsweise Hinzufügen einer Leistung speichert die Datenbank den wirksamen Preis als Snapshot. Spätere Änderungen verändern keine bereits gespeicherten Behandlungspreise.

## Wöchentlicher Heimbesuch und Kundenrhythmen

Das Heim hat einen eigenen Besuchsrhythmus, standardmäßig eine Woche. Kunden haben davon unabhängig einen eigenen Rhythmus oder übernehmen den der Untergruppe / des Wohnbereichs.

Unter **Preise & Runden → Untergruppe hinzufügen** zum Beispiel „Runde A“, Rhythmus zwei Wochen, erste Besuchswoche 06.10.2026 erstellen. „Runde B“ ebenfalls zwei Wochen, erste Besuchswoche 13.10.2026. Kunden im bearbeitbaren Profil der jeweiligen Runde zuordnen. Beim wöchentlichen Besuch werden nur aktive, fällige Kunden aufgenommen. „Friseur gewünscht: Nein“ verhindert die automatische Aufnahme und den Behandlungsstart, bis der Wunsch bewusst geändert wird.

Ein ausdrücklich eingetragenes nächstes Behandlungsdatum hat Vorrang vor der Rundenberechnung. Nach Abschluss einer Behandlung wird der nächste Fälligkeitstermin anhand des Kunden-/Runden-/Wohnbereichsrhythmus berechnet. Bei der Migration wird für Kunden mit Historie der letzte Behandlungstag als Grundlage übernommen. Für eine neue Rundeneinteilung gegebenenfalls das nächste Datum ändern oder leeren.

Änderungen an Kunden und Runden aktualisieren zukünftige automatisch zusammengestellte Besuchslisten. Bereits bearbeitete und bewusst spontan hinzugefügte Kunden bleiben erhalten. Manuell ohne automatische Kundenaufnahme geplante Besuche bleiben manuell. Verschobene Termine werden anhand des neuen Datums neu geprüft. Abgeschlossene und historische Daten werden nicht geändert.

Ein Fälligkeitsdatum ist keine eigenständige Terminbuchung: Der Kunde wird beim ersten passenden geplanten Heimbesuch ab diesem Datum berücksichtigt. Bei Bedarf den Heimbesuch selbst im Kalender planen oder verschieben.

## Krank, abwesend und spontan

„Nicht durchgeführt“ bietet Krank, Nicht vor Ort und weitere Gründe. Danach wird gefragt, wann die nächste Behandlung stattfinden soll. Ein vorgeschlagenes Datum kann geändert oder mit „Termin noch offen lassen“ geleert werden. Diese Kunden zählen nicht zum Umsatz.

Im Besuch über **+ Kunde** vorhandene Kunden einfügen und **Spontan**, **Vorgezogen** oder **Nachgeholt** wählen. Die Kennzeichnung bleibt sichtbar. Neue Kunden werden mit dem aktuellen Heim und Wohnbereich vorausgefüllt. Auch ein noch nicht fälliger Kunde darf bewusst vorgezogen werden. Ein ausdrücklich abgelehnter Friseurwunsch muss zuvor im Kundenprofil geprüft und geändert werden.

## Zahlung und anderer Rechnungsempfänger

Nach erfolgreichem Behandlungsabschluss öffnet sich die Zahlungsabfrage. Die Behandlung ist zu diesem Zeitpunkt bereits sicher gespeichert. **Später erfassen** überspringt die Zahlung ohne Verlust der Behandlung.

Zahlungsarten sind Barzahlung, Überweisung und Heimkonto; eigene Arten unter **Einstellungen → Abrechnung** ergänzen oder deaktivieren. Barzahlung schlägt „Bezahlt“ vor, andere Arten „Offen“; der Status ist änderbar. „Post“ beziehungsweise „E-Mail“ ist der getrennte Rechnungsweg, kein Zahlungsmittel.

Im Kundenprofil unter **Abrechnung** Angehörige, Betreuer oder Heim als Rechnungsempfänger mit Adresse und Kontaktdaten hinterlegen. Diese Angaben und eine übliche Zahlungsart können auch im Abschlussdialog gepflegt werden. Beim Erfassen wird ein Snapshot von Methode, Empfänger und Betrag gespeichert. Spätere Kontakt- oder Methodenänderungen ändern diese gespeicherten Angaben nicht.

Offene beziehungsweise noch nicht erfasste Zahlungen finden sich unter **Einstellungen → Abrechnung**. Das ist Zahlungsdokumentation; Rechnungsversand, Rechnungserzeugung mit fortlaufenden Rechnungsnummern und Kassensystem werden dadurch nicht eingeführt. Der PDF-Besuchsbericht behält seine datensparsame Darstellung.

## Rechte des Chefs

**Einstellungen → Team → Mitarbeiter → Berechtigungen** erlaubt einzeln:

- Kundendaten und Kundenrhythmen ändern.
- Neue Kunden in zugewiesenen Bereichen anlegen.
- Zugewiesene Termine einzeln verschieben.
- Endpreise eigener Behandlungen überschreiben.
- Zahlungen eigener Behandlungen erfassen.
- Abrechnungskontakte zugewiesener Kunden sehen und ändern.
- Als verantwortliche Person Besuche abschließen.

Zahlungserfassung und verantwortlicher Besuchsabschluss sind standardmäßig erlaubt; weitere Rechte vergibt der Chef. Teamverwaltung, allgemeine Unternehmensauswertung, Stammpreisverwaltung und Löschen bleiben beim Chef. Preis-, Zahlungs- und Terminrechte gelten ausschließlich im zugewiesenen Bereich. Andere Mitarbeiterbehandlungen werden nicht zur freien Bearbeitung zugänglich. Die Datenbank erzwingt die Rechte bei jedem Aufruf. Rechteänderungen und Zahlungen werden protokolliert.

## Foto eines Aufnahmeformulars

**Kunden → + Kunde → Kundenangaben aus Foto übernehmen**. Foto aufnehmen oder auswählen, gegebenenfalls drehen und „Angaben erkennen“. Die deutsche OCR läuft lokal im Browser. Die erforderlichen Sprach- und Erkennungsdateien werden erst bei Benutzung von der eigenen Website geladen; kein externer Bild-/KI-Dienst erhält das Formular. Foto und vollständiger OCR-Text werden nicht in der Datenbank gespeichert.

Name, Zimmer-/Raumnummer und Friseurwunsch werden als bearbeitbare Vorschläge angezeigt. Alle Angaben ausdrücklich prüfen, gegebenenfalls korrigieren, übernehmen und erst dann das Kundenformular speichern. Handschrift, Kreuze und unscharfe Bilder sind nicht zuverlässig automatisch lesbar. Die Software bestätigt keine rechtswirksame Einwilligung und importiert keine Unterschriften. Das mitgebrachte echte Formular wird weder als Demo noch als Testdatei veröffentlicht.

`npm ci` und der Build bereiten die lokalen OCR-Dateien aus dem Lockfile vor. `public/ocr` ist generiert und nicht Teil des Quellcode-Exports; die erzeugten Dateien landen beim Build in `dist/ocr`. Fotoerkennung ist kein zugesicherter Offline-Modus.

## Einführung und Feedback

Bei der ersten Anmeldung erscheint eine kurze Einführung passend zur Rolle. Sie lässt sich schließen und jederzeit unter **Einstellungen → App → Einführung erneut ansehen** oder über **Hilfe & Feedback** wieder öffnen.

Der mobile Button **Hilfe & Feedback** ist durchgehend im angemeldeten App-Bereich erreichbar. Fehler oder Verbesserung beschreiben; aktueller Bereich und Version werden mitgespeichert. Der Geschäftsführer liest und erledigt Meldungen unter **Einstellungen → Rückmeldungen**. Mitarbeiter sehen nur ihre eigenen Meldungen. Rückmeldungen werden im Unternehmen gespeichert und nicht automatisch extern an Entwickler versendet.

## Validierung und Grenzen

41 lokale Tests prüfen ursprüngliche Abläufe, Teamrechte, Isolation, neue Migration, Heimpreise, Runden, manuelle Besuche, Nachholtermine, Zahlungssnapshots, Berechtigungen und Formularkandidaten. Browserprüfungen decken Timer/Autosave/Netzwerkfehler, Abschluss, Zahlungskontakt, Krank-Folgedatum, PDF, mobile Darstellung, Chef-Rechte und Deaktivierung ab. Ein weiterer Browsertest verwendet tatsächliche lokale OCR mit einem fiktiven gedruckten Formular, anschließend bearbeitbaren Import, Runden, Kundenrhythmus, Einführung und Feedback. PWA- und Installationsdialoge werden geprüft; die eigentliche Installation ist geräteabhängig.

Der produktive Ablauf im echten Konto und die Erkennung des eigenen handschriftlichen Formulars müssen nach Migration und Deployment praktisch geprüft werden. Lokale Tests sind kein Nachweis einer bereits durchgeführten Live-Migration.
