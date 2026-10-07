# Prüfung des bisherigen Stands – Firebase-Testversion 6.2

## Was erhalten bleibt

Die bestehende Hosting-Site wurde nicht veröffentlicht oder verändert. Der GitHub-Branch `main` wurde nicht verändert; sein Vergleichsstand ist `bde7dc214d00f1ea42fba0bd198bcb5fc6674650`. Alle neuen Änderungen liegen in `firebase-spark`. Es wurden keine realen Supabase- oder Firebase-Geschäftsdaten gelöscht, umgeordnet oder importiert.

Der normale Build erzeugt weiterhin die Supabase-App unter `dist`. Der Firebase-Build erzeugt separat `dist-firebase`. Einrichtungen, Gruppen, Kunden, Preislisten, Kalender, Timer, Behandlungen, Farbrezepturen, Zahlungen, PDF, Auswertungen, Einführung, OCR und PWA bleiben im Quellcode erhalten. Die bisherige Demo-Geschäftslogik wurde in `workflowRepository.ts` herausgezogen und gemeinsam verwendet; entfernte Zeilen in `demo.ts` bedeuten hier keinen Funktionsverlust.

## Geprüfte Nachweise

- 68 lokale Tests bestanden. Der zusätzliche Firestore-Integrationstest wird separat mit echten Firebase-Emulatoren ausgeführt und bestanden; er ist im normalen Testlauf bewusst übersprungen.
- Supabase-/Demo-Browserabläufe: Besuchsablauf und PDF, Anmeldung/MFA-Anzeige, Teamrechte, automatische Speicherung und Verbindungsfehler, Heimpreislisten, Untergruppen, lokale deutsche Foto-OCR, Einführung, numerische Terminangaben und Materialgrafik.
- Firestore-Emulatoren: bestätigte E-Mail vor Datenzugriff, Unternehmenstrennung, gesperrte Finanzhistorie für Mitarbeiter, Schutz gegen selbst vergebene Rechte, atomarer Behandlungsstart, Preiskatalogprüfung und sofortige Deaktivierung.
- Firebase-Besuch mit 14 Kunden, vier Leistungen bei einer Behandlung, Zahlungsstatus nach Abschluss, Überspringen weiterer Kunden, wiederkehrender Folgetermin und historische Preise trotz Preislistenänderung.
- App-Admin kann Firmen vollständig bearbeiten, ohne als deren Mitarbeiter eingetragen zu sein.
- Der Feldvergleich `tests/firebase-data.test.ts` rekonstruiert sämtliche Beispiel-Datensätze und prüft Originalfelder einschließlich Rechnungskontakten, Zahlungs-Snapshots, internen Notizen und Farbrezepturen. Preise werden nicht in die operativen Mitarbeiterdaten übernommen. Eine dabei entdeckte gemeinsame Objektreferenz wurde durch unabhängige Kopien korrigiert.
- Das Importwerkzeug wurde ausschließlich mit fiktiven Daten im Emulator geprüft. Es vergleicht jeden gespeicherten Datensatz einschließlich historischer Finanzwerte mit dem erwarteten Import, bevor die Importsperre aufgehoben wird.
- Beide Builds und öffentliche Installation in GitHub Actions werden zusätzlich geprüft. Keine Aussage über Zustellung echter E-Mails oder echtes Google-OAuth allein aus Emulator-Tests ableiten.

## Bewusste Unterschiede – vor einem Wechsel beachten

1. Die Firebase-Testversion ist eine eigene Datenbank und Anmeldung. Noch keine automatische Synchronisierung oder vollständige Übertragung realer Bestandsdaten.
2. Bestehende Passwörter, MFA-Schlüssel und Login-Sitzungen werden nicht übertragen. Personen registrieren/verifizieren sich neu bei Firebase.
3. Mitarbeiter werden neu eingeladen und ihre Rechte/Zuweisungen geprüft. Das Importwerkzeug setzt importierte Besuche zunächst auf den Geschäftsführer. Historische Bearbeiter-IDs bleiben als zugeordnete Firebase-UIDs oder `legacy-…` erhalten; der alte Unternehmens-Export mit Teamdaten muss als Sicherung aufbewahrt werden.
4. App-Admins werden über die geschützte Firebase-Betreiberregistrierung eingerichtet, nicht über veränderbare Kunden-/Mitarbeiterprofile.
5. Spark bietet hier keine zusätzliche TOTP-Anmeldung. Google-Konten mit 2FA nutzen; diese Konfiguration kann die App nicht erzwingen.
6. Maximal vier ausgewählte Leistungen pro laufender Firebase-Behandlung. Größere Pakete als kombinierte Leistung hinterlegen. Historische Imports werden nicht auf vier gekürzt.
7. Spark-Kontingente, manuelle Backups und eingeschränkte rein serverseitige Geschäftsprozessvalidierung gelten. Details stehen in `FIREBASE-SPARK.md`.

## Was noch nicht nachgewiesen ist

Die tatsächliche Supabase-Datenbank wurde hier nicht ausgelesen. Deshalb ist noch keine Vollständigkeitszusage für einen echten Datenumzug möglich. Vor dem endgültigen Wechsel: Original-Export sichern, in eine leere Firebase-Testfirma importieren, Kunden-/Besuchs-/Behandlungszahlen und Beträge vergleichen und einen vollständigen echten Besuch prüfen. Supabase erst danach und nach ausdrücklicher Entscheidung entfernen.
