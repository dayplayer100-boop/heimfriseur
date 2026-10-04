# Entwicklungsstand – 04.10.2026

## Exportstatus

Zusammenhängender, lauffähiger V1-Quellcode auf Basis React 19, TypeScript und Vite. `npm run build` erzeugt eine statische App in `dist`. Supabase bleibt für Anmeldung und Geschäftsdaten zuständig. Firebase-Hosting-Konfiguration ist enthalten, ohne Projektzuordnung und ohne Deployment.

## Implementiert

- E-Mail-/Passwort-Anmeldung, Registrierung, Reset und neues Passwort über Supabase Auth
- Deutsche Navigation, Dashboard mit heutigen/nächsten Besuchen und Monatskennzahlen
- Einrichtungen und Gruppen, Kunden mit Suche/Filtern, Standardleistungen und Historie
- Unternehmensdaten sowie aktive/inaktive Leistungen mit Preisen und Standarddauer
- Monats-, Wochen- und Listenkalender; einzelne Besuche mit Serien-ID und Wochenrhythmus
- Planung inklusive aller aktiven Gruppenkunden; spontane vorhandene oder neue Kunden
- Verschieben eines einzelnen oder zukünftiger Termine; Absagen und bestätigtes Löschen
- Behandlung starten, tatsächlich laufender Timer mit Wiederaufnahme nach Neuladen
- Leistungsauswahl, historische Preiskopien, manuelle Endpreise, Materialkosten und Notizen
- Farbrezepturen im Profil und Behandlung, Übernahme einer früheren Rezeptur
- Zwischenstand speichern; Behandlung beenden; Kunden mit Grund überspringen
- Besuchszusammenfassung, Abschluss und automatische Anlage genau eines Folgetermins
- Arbeitszeit und Behandlungszeit, Auswertung mit Zeitraum/Einrichtung/Gruppe und 10 Kennzahlen
- PDF-Download und Druckansicht mit echten Daten des ausgewählten Besuchs, ohne interne Notizen oder Rezepturen
- PWA-Manifest, Icons, Standalone-Modus und Offline-Seite
- Separater, zurücksetzbarer Vorschau-Modus mit ausdrücklich fiktiven Browserdaten

## Datenhaltung und Schutz

Elf Tabellen einschließlich Zuordnungen besitzen `user_id`, RLS und sinnvolle Fremdschlüssel. Zusammengesetzte Fremdschlüssel prüfen den Eigentümer und die Zugehörigkeit von Wohnbereich und Einrichtung. Behandlungstabellen und operative Besuche sind für Browser-Clients nur lesbar; die Schreibabläufe verwenden authentifizierte Datenbankfunktionen mit Transaktionen. Keine anonyme RPC-Freigabe. Ein eindeutiger Index verhindert mehrere gleichzeitige Behandlungen; Start und Abschluss sind wiederholbar ohne doppelte Datensätze. Preis-Snapshots und abgeschlossene Behandlungen können nicht direkt vom Browser überschrieben werden. Historische Kunden werden deaktiviert; Löschungen mit abhängigen Daten sind durch Fremdschlüssel geschützt.

## Tatsächlich geprüft

- TypeScript-Prüfung und Produktionsbuild erfolgreich
- 17 lokale Tests erfolgreich: PostgreSQL-Migration, alle 11 RLS-Tabellen, Kontoinitialisierung, Stammdaten und Standardleistungen, Planung, Preis-Snapshot nach Preisänderung, Doppelklick auf Start, Behandlung inklusive Material/Rezeptur, Überspringen, Abschluss/Folgetermin, Löschschutz, negative Werte, zwei getrennte Nutzer, anonyme RPC-Sperre, Verschieben der Serie ohne Änderung abgeschlossener Historie, Sperre eines zweiten laufenden Kunden, Datumsberechnung und Kennzahlen
- Browser-Test in der getrennten Vorschau bei 390 × 844 und 1440 × 1000: Timer läuft und Zwischenstand bleibt nach Neuladen erhalten; zwei Kunden behandelt, einer übersprungen, Besuch abgeschlossen, ein Folgetermin angelegt, PDF heruntergeladen, Auswertung geöffnet, neue Einrichtung/Gruppe/Kunde angelegt und Gruppenkunden automatisch zum Besuch hinzugefügt
- Kein horizontaler Überlauf im mobilen Dashboard und in der Auswertung; Desktop- und Smartphone-Darstellung visuell geprüft
- Derselbe Browser-Ablauf auch am Produktionsbuild erfolgreich; zusätzlich Manifest, PNG-Icons, aktiver Service Worker und Offline-Navigation geprüft
- Erzeugtes Test-PDF enthält Kunden, Zimmer, Leistungen, Zeiten und Preise sowie die Zusammenfassung und Unterschriften

## Noch nicht live verifiziert

Es wurde **kein echtes Supabase-Projekt bereitgestellt**. Die Migration wurde daher noch nicht remote ausgeführt. Registrierung, E-Mail-Bestätigung, Passwort-Reset, reale PostgREST-Abfragen und produktive Speicherung wurden nicht gegen einen entfernten Supabase-Dienst getestet. Die lokalen Datenbanktests verwenden echtes PostgreSQL über PGlite mit einer nachgebildeten Auth-Umgebung; sie ersetzen diesen Integrationstest nicht.

PWA-Installation unter iOS/Android, Druckdialoge der jeweiligen Betriebssysteme und Firebase-Hosting wurden noch nicht auf einem veröffentlichten HTTPS-Stand getestet. Es gibt kein veröffentlichtes Produktionssystem und keinen produktiven Nutzerdatenbestand in diesem Export.

## Bewusste Vereinfachungen der V1

- Ein Folgetermin entsteht beim Abschluss, statt eine lange Terminserie vorab aufzublähen. Einzelne Termine bleiben normale Datensätze.
- Timer ohne Pause; keine komplexe Offline-Synchronisation.
- Manuelles Zwischenspeichern von Behandlungseingaben; bei Rückkehr zur Liste wird ein geänderter Zwischenstand gespeichert. Die Timer-Startzeit ist unabhängig davon sofort in der Datenbank gesichert. Beim Verlassen über andere Navigation können ungespeicherte Formularänderungen verloren gehen; der Timer läuft weiter.
- Keine manuelle Kundensortierung. Laufender Kunde, offene, erledigte und übersprungene Kunden werden automatisch gruppiert.
- Logo als URL statt eigener Upload-Infrastruktur.
- Handgeschriebenes responsives CSS statt Tailwind; keine zusätzliche Build-Schicht für ein überschaubares Designsystem.
- Einfache Zustandshaltung ohne Redux/React Query. Eigene Daten werden in Blöcken à 1.000 Zeilen geladen; historische Daten liegen anschließend für die Auswertung im Speicher. Für deutlich größere Datenmengen wäre eine serverseitige, nach Zeitraum gefilterte Aggregation der nächste sinnvolle Schritt.
- Auswertung ordnet Behandlungen nach Besuchsdatum zu; Arbeitszeit stammt aus abgeschlossenen Besuchen. Material-Abzug ist keine vollständige betriebswirtschaftliche Gewinnrechnung.
- Zeitrechnung verwendet serverseitige Zeitstempel, Terminserien kalenderbasierte Tage und Darstellung Europe/Berlin.

## Nächster Integrationsschritt

Supabase-Migration anwenden, öffentliche Verbindung konfigurieren, Auth-Redirects freigeben und den vollständigen Ablauf mit einem realen Testkonto prüfen. Danach den geprüften Build in das im Windows-Chat ausgewählte Firebase-Hosting-Projekt übernehmen. Kein Backend-Wechsel zu Firebase erforderlich.

## Aktualisierung: echte Supabase-Verbindung

Der Nutzer hat die Migration erfolgreich auf dem Projekt `bvqysdiofglgxqtydeko` ausgeführt. Die öffentliche Verbindung ist in `src/deployment.ts` als Browserkonfiguration hinterlegt; sie enthält keinen Secret- oder Service-Role-Key. Vite-Variablen oder eine bewusst gespeicherte Browserkonfiguration können diese Standardverbindung ersetzen.

Am echten Projekt geprüft: Auth-Einstellungen erreichbar (HTTP 200), E-Mail-Anmeldung und Registrierung aktiviert; anonyme Leseversuche auf allen elf Tabellen und die anonyme Kontoinitialisierung abgewiesen (HTTP 401, PostgreSQL 42501). Build und 17 lokale Tests weiterhin erfolgreich. Die früheren Aussagen zur noch fehlenden Supabase-Verbindung sind damit überholt. Der vollständige authentifizierte Live-Ablauf, E-Mail-Bestätigung und Passwort-Reset bleiben nach Veröffentlichung mit dem eigenen Konto zu prüfen. Vor der Registrierung muss die Firebase-Adresse als Supabase Site URL/Redirect URL eingestellt werden.
