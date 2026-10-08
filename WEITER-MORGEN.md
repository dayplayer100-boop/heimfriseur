# HeimFriseur – Arbeitsstand 08.10.2026

## Quellcode

Version **6.5.0**, Firebase Spark ohne Zahlungskonto/Cloud Functions. Phasen 1–4 implementiert; Phase 5 enthält Betreiber-Sicherung, Rollenprüfung, Emulator-Wiederherstellung und ausfüllbare Freigabe-Checkliste. Die echte Live-Ausführung und Tests auf echten Mobilgeräten sind noch offen.

- Live-Projekt: `heimfriseur-dayplayer100`.
- Ausschließlich Firebase-Testsite: `heimfriseur-test-237368331242`.
- Supabase-Website `heimfriseur-app.web.app` unverändert; vorhandener Supabase-Build bleibt möglich.
- Historischer geprüfter Phase-1-Commit: `6f2efb8d45746899ce90dbd56842f93790d0be0b`.
- Keine Live-Migration, Regelveröffentlichung oder Hosting-Veröffentlichung in dieser Sitzung.

## Sicherheitskorrekturen

Geschützte Rechnungskontakte; Besuchs-Prüfdokumente und atomare Behandlungssperren; kanonische Millisekunden; ganzzahlige Centwerte; genau eine aktive Geschäftsführung; unveränderliche mit tatsächlicher Fachänderung verknüpfte Protokolle mit Serverzeit; paginierte Abfragen; Cache-Verwerfung bei Sitzungswechsel/Fehler; Februar-Kalenderfix; getrennte CI/Hosting-Ziele und Tastaturfokus in Dialogen.

Startfehler durch entfernte interne Protokollmetadaten behoben. Mitarbeiter können weiterhin keine unveränderlichen Identitäts-/Firmenfelder ändern. Firmenauswahl eines Administrators ist ein geprüfter lokaler Lesekontext; dafür wird kein frei geschriebenes, angebliches Fachereignis mehr erzeugt. Identische Auth-Rückmeldungen setzen die Oberfläche nicht mehr unnötig zurück.

Besuchsplanung ist wiederaufnehmbar und bleibt bis zur vollständigen Kundenaufnahme gesperrt. Finanzprüfung erlaubt höchstens vier Leistungen je Behandlung (Firestore-Regellimits). Visit-Historie wird nicht per Client gelöscht. Bei fachlichen Paralleländerungen neu laden und erneut versuchen.

## Nachgewiesene lokale Prüfungen

- TypeScript-Prüfung und Firebase-/Supabase-Produktionsbuilds.
- Unit-Tests plus zwei echte Emulator-Integrationsfälle (vollständiger Team-/Besuchsablauf; Paginierung mit 250 Mitarbeiter-Datensätzen).
- Direkte API-Negativtests: Fremdfirma, Kontakte, Finanzhistorie, offener Besuch, gefälschte Prüfdokumente, negative/verkehrte Zeit, fehlender Finanzabschluss/Sperrfreigabe, Gleitkommawerte, zweite Geschäftsführung und erfundene Protokolle.
- Betreiber-Migrationen: vollständiger Datenvergleich, Dry-Run, private Sicherung, absichtlicher Teilabbruch, Wiederaufnahme, Centmigration und Wiederholbarkeit.
- Geschützte Sicherung mit Rollenprüfung und Wartungssperre; Emulator-Restore jedes Dokuments; falscher Backup-Hash abgelehnt.
- Mobile Chromium-Browserprüfung: E-Mail-Bestätigung im Emulator, Login, Rollenverwaltung, Einladungslink, Google-/Passwort-Identitätsverknüpfung im Emulator, Firmenzugang, Dialog-Tastaturfokus und keine horizontale Überbreite.
- Paket-Audit: keine bekannten Schwachstellen gemeldet.

## Als Nächstes mit Nutzer

1. `PHASE-1-LIVE.md` mit echter Unternehmens-Dokument-ID durchführen (ID weiterhin nicht geliefert).
2. `PHASE-2-5-FREIGABE.md`: aktuelle Regeln, Workflow-/Finanzmigrationen, private Sicherung, ausschließlich Testhosting.
3. Tatsächliche Google-Anmeldung, Mailzustellung, Passwortreset, Einladungen und Versionswechsel auf Android/iPhone prüfen. Emulator-E-Mails sind kein Zustellnachweis.
4. Freigabe-Checkliste vollständig ausfüllen. **Echte Kundendaten weiterhin nicht freigegeben.**

Nicht automatisch neue Funktionen ergänzen und nicht unterstellen, dass die Live-Migration schon stattgefunden hat. Private Sicherungen/Hashablage, Tokens und Dienstkontodateien nie in GitHub oder Chat hochladen.
