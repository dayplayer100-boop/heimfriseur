# HeimFriseur: getrennte Firebase-Testversion, ohne Zahlungskonto

**Aktuell 6.5.0:** Bestehende Testsite `heimfriseur-test-237368331242`. Vor Veröffentlichung die [Live-Phase 1](PHASE-1-LIVE.md) und anschließend [Migrationen/Abnahme Phasen 2–5](PHASE-2-5-FREIGABE.md) durchführen. Neue Regeln erfordern `payment_contacts_schema: 1`, `workflow_schema: 2`, `finance_schema: 3`. Die folgenden Abschnitte beschreiben die ursprüngliche Einrichtung; keine neue Hosting-Site dafür anlegen.

Stand: Version 6.3. Die bisherige Supabase-App bleibt bestehen. Der Firebase-Build
nutzt Firebase Authentication und Firestore Standard im Spark-Tarif, ohne Cloud
Functions, Cloud SQL, Cloud Storage, Extensions oder Zahlungskonto. Das Projekt
ist `heimfriseur-dayplayer100`. Die Test-Hosting-Site heißt
`heimfriseur-firebase-test`, sofern dieser Name verfügbar ist.

## Was schon im Quellcode umgesetzt und lokal geprüft wird

- Gleiches React-Frontend und gleicher Besuchsablauf, eigener Firebase-Build.
- E-Mail/Passwort, Bestätigung erneut senden nach Anmeldung, Passwortzurücksetzung
  über Firebase und Google-Anmeldung. Geschäftsdaten erfordern serverseitig
  `email_verified`, auch bei direktem Firestore-Zugriff.
- Unternehmen, Einrichtungen, Gruppen, Kunden, Standardleistungen, separate
  Heimpreislisten, Besuche, Timer, Behandlungssnapshots, Materialkosten,
  Farbrezepturen, Auswertung und PDF verwenden Firestore-Dokumente.
- Geschäftsführer verwalten Mitarbeiter über bestätigte E-Mail-Einladungen,
  Berechtigungen, Besuchszuweisung und Deaktivierung. Keine Rollen aus
  benutzeränderbaren Profilfeldern oder Google-Namen.
- Mitarbeiter sehen die ihnen zugewiesenen Besuche und Stammdaten der damit
  freigegebenen Einrichtungen. Sie sehen aktuelle Leistungspreise für die
  Behandlung, aber keine abgeschlossenen Umsätze oder Materialkosten.
- Finanzfelder sind in separaten `finance`-Dokumenten; Rechnungsansprechpartner
  sind in einer getrennten `billing`-Sammlung. Kundenlisten enthalten diese
  Finanzfelder überhaupt nicht. Mitarbeiter können ausschließlich die eigenen
  laufenden Finanzdaten lesen. Ein Abrechnungsrecht gibt keinen Umsatzbericht frei.
- Behandlung und Finanzsnapshot werden atomar geschrieben. Je Mitarbeiter und
  Kunde verhindern Sperrdokumente doppelte gleichzeitige Behandlungen.
- Eine Unternehmensrevision verhindert unbemerkte Überschreibungen bei parallelen
  Änderungen. Wenn Daten unverändert bleiben, werden die großen Listen aus dem
  Speicher wiederverwendet. Kein dauerhafter Firestore-Kundendaten-Cache auf Disk.
- App-Admins sind ein eigener, geschützter Betreiberbereich und werden nicht als
  Mitarbeiter des Unternehmens eingetragen. Der Geschäftsführer bleibt Eigentümer.

## Wichtige Unterschiede zum bisherigen Backend

1. **Kein Authenticator-TOTP im Spark-Build.** Die bisherige Supabase-MFA wurde
   nicht nachgebaut oder als vorhanden dargestellt. Google-Konten sollten mit
   Zwei-Faktor-Schutz gesichert sein; die App kann Googles 2FA-Konfiguration nicht
   selbst erzwingen. Wird verpflichtende zusätzliche App-MFA benötigt, muss die
   Architektur/Tarifwahl erneut geprüft werden.
2. **Separate Daten und Anmeldung.** Änderungen in der Testversion werden nicht
   automatisch nach Supabase kopiert. Supabase-Passwörter und Authenticator-Schlüssel
   werden nicht exportiert. Firebase-Konten werden neu registriert/bestätigt.
3. **Der erste App-Admin wird durch den Betreiber eingerichtet.** Ab Version 6.3
   können ausschließlich bestehende App-Admins weitere bestätigte Konten über die
   App ernennen. Geschäftsführer und Mitarbeiter dürfen die Registrierung nicht
   verändern. Admin-Änderungen werden protokolliert.
4. **Keine garantierte unbegrenzte kostenlose Produktion.** Spark hat Tages- und
   Speichergrenzen. Werden sie erreicht, können Aktionen bis zur Kontingenterneuerung
   ausfallen. Kein automatisches Upgrade und keine kostenpflichtigen Dienste.
5. **Transaktionen haben Grenzen.** Sehr große Besuchs-/Sammeländerungen können
   Firestore-Limits für Dokumentzugriffe in Regeln erreichen; sie werden vollständig
   abgelehnt, statt teilweise gespeichert. Bei der Testabnahme unbedingt einen
   realistischen großen Besuch mit mehreren Mitarbeitern durchspielen.
6. **Keine unabhängige serverseitige Prozess-Engine.** Firestore-Regeln sichern
   Mandanten, Rollen, Geldzugriffe, Snapshots und Behandlungssperren. Komplexe
   Geschäftsabläufe, etwa die Übersicht aller offenen Kunden vor Besuchsabschluss,
   werden zusätzlich im Client geprüft. Firebase Spark ersetzt keine vollständige
   serverseitige Validierung aller fachlichen Abläufe. Für streng manipulationssichere
   Prozess-/Auditgarantien wäre ein vertrauenswürdiges Backend erforderlich.
7. **Audit ist kein revisionssicheres Archiv.** Geschriebene Audit-Dokumente sind
   nicht durch Browserkonten änderbar/löschbar. Ein berechtigter Firmeninhaber könnte
   außerhalb der App zulässige Datenänderungen ohne den vorgesehenen Client-Logeintrag
   ausführen. Firmeninhaber werden als vertrauenswürdige Datenverwalter behandelt.
8. **Manuelle Sicherung erforderlich.** Ohne Zahlungskonto werden weder automatische
   Firestore-Backups noch Storage-Uploads eingerichtet. Foto-OCR läuft wie bisher
   lokal; Papierfotos werden nicht an einen externen OCR-Dienst geschickt.

## Einmalig im Firebase-Dashboard

1. [Authentication](https://console.firebase.google.com/project/heimfriseur-dayplayer100/authentication/providers):
   „Jetzt starten“, dann E-Mail/Passwort und Google aktivieren. Google-Support-E-Mail
   festlegen. Keine anonymen Konten einschalten.
2. Auth → Einstellungen → autorisierte Domains: Test-Hosting-Domain hinzufügen,
   sobald die Site angelegt ist: `heimfriseur-firebase-test.web.app` und gegebenenfalls
   `.firebaseapp.com`. Später auch `heimfriseur-app.web.app` für den endgültigen Wechsel.
3. Auth → E-Mail-Vorlagen: deutsche Absender-/Bestätigung-/Reset-Texte prüfen.
   Absender ist Firebase, nicht mehr Supabase SMTP. Versand und Spam mit einer
   echten Testadresse prüfen. App-Passwortrichtlinie auch in Firebase auf mindestens
   12 Zeichen setzen und Schutz gegen E-Mail-Aufzählung aktivieren, soweit verfügbar.
4. [Firestore](https://console.firebase.google.com/project/heimfriseur-dayplayer100/firestore):
   Standard-Datenbank `(default)` anlegen, EU-Region auswählen, zum Beispiel Frankfurt,
   **Produktionsmodus**. Die Region später nicht als beliebig änderbar behandeln.
   Keine offenen „Testmodus“-Regeln verwenden. Spark beibehalten; keinen Blaze-Tarif
   aktivieren. Falls ein Dashboard-Schritt ein Zahlungskonto verlangt, abbrechen und
   den Schritt zuerst prüfen.
5. Betreiberkonten bei Google/GitHub mit MFA schützen. Mitarbeiter erhalten keinerlei
   Zugriff auf Firebase-Projekteinstellungen, IAM oder die Datenbankkonsole.

## Quellcode und getrennte Veröffentlichung

Node.js ab 22.12. Java 21 für Emulator-Tests. Der Quellcode liegt separat im Branch
`firebase-spark`. In Cloud Shell einen neuen Ordner verwenden:

```bash
git clone --branch firebase-spark https://github.com/dayplayer100-boop/heimfriseur.git heimfriseur-firebase
cd ~/heimfriseur-firebase
npm ci
npm run build:firebase
```

Ausgabe: **`dist-firebase`**. Der normale `npm run build` erzeugt weiterhin die
Supabase-Version in **`dist`**. Die öffentliche Firebase-Konfiguration ist bereits
in `src/firebaseDeployment.ts` hinterlegt; keine privaten Schlüssel erforderlich.

Die folgenden Befehle richten ausschließlich die Test-Hosting-Site und die neu
präfixierten Firestore-Sammlungen ein. Die bestehende Hosting-Site wird nicht
überschrieben. **Firestore-Regeln gelten für die gesamte Datenbank**: Gibt es im
selben Projekt bereits andere Firestore-Anwendungen, ihre Regeln zuerst zusammenführen.
Die mitgelieferten Regeln verweigern unbekannte Sammlungen standardmäßig.

```bash
npx --yes --package firebase-tools@15.32.1 firebase hosting:sites:create heimfriseur-firebase-test --project heimfriseur-dayplayer100
npx --yes --package firebase-tools@15.32.1 firebase deploy --only firestore:rules,firestore:indexes,hosting --config firebase.parallel.json --project heimfriseur-dayplayer100
```

Site bereits vorhanden? Den ersten Befehl auslassen. Name belegt in fremdem Projekt?
Anderen Test-Site-Namen wählen und ausschließlich `hosting.site` in
`firebase.parallel.json` entsprechend ändern.

Der Download-/Installationsbutton und der PWA-Update-Mechanismus sind dieselben wie
bisher. Die Test-PWA und die bisherige PWA haben verschiedene Ursprünge und daher
verschiedene Sitzungen. Später kann der geprüfte Firebase-Build auf die bisherige
Domain wechseln; dann erscheinen Website und installierte PWA nach einem sicheren
Neuladen auf demselben Build. Keine separate APK nötig.

## App-Admin einrichten

Alternativ in der angemeldeten Google Cloud Shell gezielt ausführen:

```bash
node scripts/firebase-grant-admin.mjs --email ADMIN_EMAIL --project heimfriseur-dayplayer100
```

`ADMIN_EMAIL` durch die bereits bestätigte Firebase-Konto-Adresse ersetzen. Der Befehl ermittelt die UID serverseitig, lehnt unbestätigte/deaktivierte Konten ab und schreibt Admin-Registrierung und Betreiberprotokoll gemeinsam. Er verwendet den vorhandenen Cloud-Shell-IAM-Zugang, keine privaten Schlüssel. Geschäftsdaten und Teamzuordnungen werden nicht verändert. Anschließend ab-/anmelden. Das Werkzeug gewährt ausschließlich Plattformrechte; es macht Mitarbeiter nicht zu Geschäftsführern anderer Firmen.


Erst das Admin-Konto in der Testversion registrieren und bestätigen. Unter Firebase
Authentication → Nutzer dessen **Firebase-UID** kopieren. In Firestore ein Dokument
`hf_admins/FIREBASE_UID` mit `is_active` als Boolean `true` und `email` als String
anlegen. Zugriff ausschließlich für die verifizierte UID, keine Rollenprüfung
anhand einer im Browser angegebenen E-Mail. Niemals Service-Account-Schlüssel
in Frontend oder Repository legen. Weitere Admin-Zugänge können ab Version 6.3
auch durch einen vorhandenen App-Admin in der App verwaltet werden. Das Firmenkonto
von T-cut bleibt davon getrennt.

## Daten aus Supabase übernehmen

**Supabase noch nicht löschen.** Das pausierte Projekt muss für den Export erreichbar
sein. Falls beide aktiven Gratisplätze belegt sind, zuerst mit dem Nutzer klären,
welches andere Projekt vorübergehend pausiert werden kann.

1. Alle laufenden Behandlungen beenden und Schreibzugriffe während der Übertragung
   abstimmen. Geschäftsführer öffnet die bisherige App → Einstellungen → App →
   „Unternehmensdaten exportieren“. Export sicher lokal aufbewahren; enthält Kundendaten.
2. Geschäftsführer in Firebase registrieren, E-Mail bestätigen. Das neue Unternehmen
   zunächst leer lassen. App-Admin separat einrichten.
3. Export lokal prüfen, noch ohne Zugriff/Änderungen an Firebase:

```bash
node scripts/firebase-migrate.mjs --file /sicherer/pfad/export.json --owner-email chef@example.de
```

4. In der eigenen autorisierten Google Cloud Shell erfolgt der Import mit deren
   IAM-Anmeldung, **ohne** heruntergeladenen privaten Dienstkontoschlüssel:

```bash
node scripts/firebase-migrate.mjs --file /sicherer/pfad/export.json --owner-email chef@example.de --apply
```

Nur ein leeres Zielunternehmen wird importiert. Ein vorhandenes Geschäftsunternehmen
wird nicht überschrieben. Dokumente, historische Preise, Rechnungsansprechpartner und
Summen werden nach dem Import verglichen. Bei Abbruch bleibt `_migration_state`
auf `in_progress`; die App blockiert dann die Arbeit. Originalexport behalten und
Betreiberprüfung durchführen. Nicht den Marker manuell entfernen oder Supabase löschen.
Die Importdatei und UID-Zuordnung gehören niemals in GitHub oder den Quellcode-ZIP.

Die bisherigen Supabase-UUIDs der Datensätze bleiben erhalten. Neue Firebase-UID des
Geschäftsführers wird als Eigentümer eingesetzt. Historische Mitarbeiter werden
zunächst durch `legacy-...`-IDs erhalten; Mitarbeiter müssen neu eingeladen werden.
Für bekannte neue Firebase-UIDs kann eine private JSON-Zuordnung mit `--uid-map`
angegeben werden. Unbekannte historische Konten erhalten dadurch keine neuen Rechte.

Der Unternehmens-Export ist **kein Vollbackup des Supabase-Projekts**. Andere
Unternehmen, Auth-Konten, geschützte Admin-Registrierung und alte technische Logs
müssen bei Bedarf separat gesichert werden. Erst nach vollständigem Datenvergleich,
Konten-/Rechtetest und praktischer Abnahme darf der alte Supabase-Platz freigegeben werden.

## Tests und Grenzen der Abnahme

```bash
npm test
npm run build
npm run build:firebase
npm run test:firebase
```

Emulator-Tests verwenden `demo-heimfriseur`, fiktive Daten und erlauben keine Zugriffe
auf das echte Projekt. Die Firebase CLI wird als gepinnte externe Entwicklungs-CLI
aufgerufen, nicht als Bibliothek in der App ausgeliefert.

Zusätzlicher Browser-Test: Auth/Firestore-Emulatoren starten, dann:

```bash
VITE_FIREBASE_PROJECT_ID=demo-heimfriseur VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_APP_ID=1:demo:web:local VITE_FIREBASE_EMULATORS=true npm run dev -- --mode firebase-emulator --port 5174
node scripts/firebase-browser-check.mjs
```

Produktions-Mailzustellung, echtes Google-OAuth, EU-Datenbankregion, Import echter
Bestandsdaten und Kontingente sind anschließend im echten Projekt zu prüfen. Lokale
Tests sind keine externe Sicherheitszertifizierung und keine garantierte DSGVO-Abnahme.

## Optionale öffentliche Build-Variablen

`VITE_BACKEND=firebase`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
Emulatoren ausschließlich mit Demo-Projekt-ID und `VITE_FIREBASE_EMULATORS=true`.
Keine Werte für Admin-Schlüssel, Google-Client-Secret oder SMTP-Passwort im Frontend.

Dokumentation: [Spark/Blaze](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans),
[Firestore-Kontingente](https://firebase.google.com/docs/firestore/quotas),
[Transaktionen und Regelgrenzen](https://firebase.google.com/docs/firestore/manage-data/transactions),
[Firebase Auth](https://firebase.google.com/docs/auth/web/start).

### Grenze bei Leistungskombinationen

Die Firebase-Testversion erlaubt maximal vier ausgewählte Leistungen pro laufender Behandlung. Firestore begrenzt die Auswertung der Sicherheitsregeln; größere Kombinationen werden vor dem Speichern verständlich abgewiesen. Bei Bedarf eine kombinierte Leistung (z. B. „Waschen / Schneiden / Föhnen“) in der Preisliste anlegen. Historische Imports bleiben vollständig erhalten. Leistungssnapshots liegen gemeinsam im Behandlungsdokument; Preise bleiben ausschließlich im geschützten Finanzdokument.

## Geschäftsführer übernehmen, App-Admin getrennt behalten

Beide Konten müssen bereits bestätigt sein. In der angemeldeten Cloud Shell:

```bash
node scripts/firebase-transfer-owner.mjs --project heimfriseur-dayplayer100 --from-admin ADMIN_EMAIL --to-owner CHEF_EMAIL
```

Der bisherige Firmeninhaber muss bereits geschützter App-Admin sein. Die Übernahme ermittelt die Konto-IDs serverseitig, überträgt bestehende Unternehmens-/Datensatzzuordnungen in einer einzigen Transaktion und entfernt das Admin-Konto aus der Firmenmitgliederliste. Historische Bearbeiter und Finanzwerte bleiben erhalten. Ein automatisch erzeugtes leeres Unternehmen des neuen Geschäftsführers wird bereinigt; bei echten Daten, Kollegen oder Einladungen in dieser zweiten Firma bricht das Werkzeug ab. Laufende Behandlungen zuerst beenden. Große Unternehmen oberhalb der Einzeltransaktionsgrenze werden nicht teilweise übertragen. Eine Wiederholung nach erfolgreicher Übernahme ist ohne weitere Änderungen möglich. Die App zeigt Plattformzugriff als „Admin“ und die tatsächliche Firmenrolle als „Geschäftsführer“.

## 6.3: Benutzerverwaltung durch App-Admins

Unter **Einstellungen → App-Admin → Benutzer & Rollen** kann ein bestehender App-Admin bestätigte Benutzer zu App-Admins ernennen oder innerhalb ihres Unternehmens zwischen Mitarbeiter und Geschäftsführer wechseln. Die globale Admin-Rolle ist unabhängig vom Unternehmenseigentümer. Geschäftsführer und Mitarbeiter haben weder Zugriff auf dieses Verzeichnis noch auf die Rollenverwaltung. Der eigene Admin-Zugang kann nicht deaktiviert oder herabgestuft werden.

Bestätigte Benutzer tragen beim nächsten Login ausschließlich ihre eigene UID, E-Mail und ihren Anzeigenamen in `hf_users` ein. Dieses Verzeichnis verleiht keine Rechte. Für bereits registrierte Konten ist daher nach dem Update eine erneute Anmeldung erforderlich, bevor sie in der Verwaltung auftauchen. Die erste Einrichtung eines App-Admins bleibt eine Betreiberaktion; anschließend sind weitere Admin-Zugänge über die App möglich.

Geschäftsführerwechsel erfolgen atomar, revisionsgeprüft und mit Admin-Protokoll. Die bisherige Geschäftsführung wird Mitarbeiter; falls das bisherige Konto bereits App-Admin ist, wird seine Unternehmensmitgliedschaft entfernt und der Plattformzugang bleibt erhalten. Historische Leistungen, Finanzdaten und Kunden werden erhalten. Laufende Behandlungen müssen vorher abgeschlossen werden. Konten mit einer anderen Unternehmenszuordnung werden nicht automatisch verschoben. Für eine solche Übertragung bleibt das gesonderte, geprüfte Betreiberverfahren erforderlich. Übertragungen über 300 operative/Abrechnungsdokumente werden ebenfalls nicht automatisch ausgeführt.

**Bereitstellung:** Auch die neuen Sicherheitsregeln veröffentlichen, bevor die neue App verwendet wird:

```bash
npm run build:firebase
npx --yes --package firebase-tools@15.32.1 firebase deploy --only firestore:rules,hosting --config firebase.parallel.json --project heimfriseur-dayplayer100
```

Nur die parallele Test-Site ist betroffen, wenn in `firebase.parallel.json` die eigene Test-Site `heimfriseur-test-237368331242` eingetragen ist. Supabase und die ursprüngliche Hosting-Konfiguration bleiben bestehen. Plattform-Quellcode, Google-Cloud-IAM und Auth-Konten löschen/Passwörter ändern sind weiterhin Betreiberaufgaben; App-Admins verwalten die Geschäftsdaten und App-Rollen.

## 6.3.1: Anmeldung und Mitarbeiter-Einladungen

Ein noch gespeicherter Mitarbeiter-Einladungslink konnte auch einen bereits angemeldeten Plattform-Admin im Beitrittsbildschirm festhalten („Dieses Konto gehört bereits zu einem Unternehmen“). Vor einem Beitritt wird jetzt die serverseitige Admin-Rolle geprüft. Ein aktiver Admin verlässt diesen Mitarbeiterablauf automatisch und öffnet die Verwaltung. Wiederholtes Annehmen derselben bereits angenommenen Einladung ist für dieselbe UID und Unternehmenszuordnung ebenfalls erfolgreich; fremde Firmenzuordnungen werden weiterhin nicht überschrieben.

Die Einladung bleibt im Rücksprung-Link bei E-Mail-Bestätigung und Passwortzurücksetzung erhalten. Neue Firebase-Einladungen speichern den Link-Token zusätzlich in ihrem geschützten Einladungsdokument, damit der Geschäftsführer/Admin den Link neben der E-Mail erneut kopieren kann. Dafür erhalten weder andere Unternehmen noch beliebige Mitarbeiter Leserechte. Alte Einladungen ohne Link-Token können über „Neuen Link erstellen“ ersetzt werden; Widerruf des alten und Erzeugung des neuen Links erfolgen atomar. Tokens nicht in Git, Screenshots oder öffentliche Logs aufnehmen.

Unter Einstellungen → App → Kontosicherheit lässt sich Google mit einem angemeldeten Konto verbinden. Die UID und damit Rollen und Daten bleiben erhalten. Google-Konten können über eine Passwort-E-Mail zusätzlich einen Passwortzugang einrichten. Firebase Authentication muss **E-Mail/Passwort und Google** aktiviert haben und `heimfriseur-test-237368331242.web.app` als autorisierte Domain führen. Ein echter Google-OAuth-/Mailversandtest erfordert weiterhin die eigene Console-Konfiguration; Emulatorprüfungen ersetzen diesen nicht.

Die Standardvorlage enthält ausschließlich die neun Leistungen und Preise aus dem Foto, keine Bank-/Adressdaten. Neue Firebase-Unternehmen erhalten sie automatisch. Bestehende Firmen können sie unter Leistungen ausdrücklich übernehmen. Bestehende passende Leistungen werden anhand von Name/Alias aktualisiert; individuelle Heimpreislisten und historische Preis-Snapshots bleiben erhalten. Behandlungszeiten der Vorlage sind editierbare Schätzungen.

Für den gewünschten Plattform-Admin kann der Betreiber bei fehlendem Registry-Eintrag in seiner Cloud Shell idempotent ausführen:

```bash
node scripts/firebase-grant-admin.mjs --email dayplayer100@live.de --project heimfriseur-dayplayer100
```

Der Befehl prüft das bestätigte Firebase-Konto und erhält die Geschäftsführerzuordnung von T-cut sowie sämtliche Geschäftsdaten. Er ist bei einem bloß gespeicherten Einladungslink nicht erforderlich: Dort reicht die aktualisierte App oder vorläufig „Einladung verlassen“.

## 6.3.2: App-Ersteller direkt im bestehenden Unternehmen

Das Betreiberwerkzeug `firebase-assign-admin-company.mjs` ist für den Fall gedacht, dass der Geschäftsführer bereits seine eigene Firma hat und der Plattform-Admin zusätzlich eine eigene, nicht benötigte Firma angelegt hat. Es erhält die bestehende Geschäftsführung, setzt das Standardunternehmen in der geschützten Admin-Registry, ordnet den Admin-Account diesem Unternehmen zu und entfernt eine gegebenenfalls vorhandene Unternehmensmitgliedschaft des Admins. Der Admin-Zugang funktioniert ausschließlich über Plattformrechte.

```bash
node scripts/firebase-assign-admin-company.mjs --project heimfriseur-dayplayer100 --from-admin dayplayer100@live.de --to-owner t-cut@web.de
```

Beide Identitäten werden über bestätigte Firebase-Konten nachgeschlagen. Die Geschäftsführerrolle des Zielkontos muss vorhanden und aktiv sein. Eine zusätzliche, ausschließlich vom Admin gehaltene Firma wird mit `_archived: true` stillgelegt und hat anschließend keinen aktiven Geschäftsführer. Ihre Kunden-, Behandlungs-, Abrechnungs- und Finanzdokumente werden nicht gelöscht oder in T-cuts Firma gemischt. Die Sicherheitsregeln sperren den Geschäftszugriff auf stillgelegte Firmen; die App blendet sie aus der Liste aktiver Firmen aus. Ein Betreiber kann die Sicherung mit IAM wiederherstellen. Bei weiteren Teammitgliedern oder laufenden Behandlungen wird vor jeder Änderung abgebrochen. Der gesamte Vorgang erfolgt in einem Commit mit Revisions-/Dokumentprüfungen und Admin-Protokoll; Wiederholung ist ohne zusätzliche Änderungen möglich.

Nach Veröffentlichung der aktuellen Regeln und der App öffnet der Admin bei fehlender oder veralteter Auswahl automatisch sein hinterlegtes Standardunternehmen. Dafür werden keine Rollen aus E-Mail-Namen, lokalen Einstellungen oder Profilfeldern abgeleitet. Ein bestehender Admin kann weiterhin ausdrücklich andere aktive Firmen auswählen, sofern solche vorhanden sind.


## 6.4.0: Unternehmens-Administratoren und zusätzliche Firma löschen

Unter Einstellungen → Team können Geschäftsführer und Unternehmens-Administratoren
Mitarbeiter oder Administratoren einladen und bestehende Rollen ändern. Administratoren
haben volle Rechte ausschließlich im eigenen Unternehmen. Globale App-Admin-Rechte
(`hf_admins`) bleiben getrennt und können nur App-Admins/Betreiber vergeben werden.
Ein Geschäftsführerwechsel erfolgt atomar nach Bestätigung; der bisherige Geschäftsführer
wird Unternehmens-Administrator. Der aktuelle Geschäftsführer kann erst nach einer
Übergabe herabgestuft werden. Eigene Rollenänderungen sind gesperrt.

Ein gültiger Einladungslink wird auch für App-Admins berücksichtigt. Ein bereits demselben
Unternehmen zugeordnetes Konto darf eine Einladung annehmen; eine andere bestehende
Firma wird weiterhin nicht durch eine Einladung überschrieben. Links bleiben neben der
E-Mail kopierbar und widerrufbar.

Für das ausdrücklich gewünschte Entfernen einer zusätzlichen eigenen Admin-Firma:

```bash
node scripts/firebase-grant-admin.mjs --email dayplayer100@live.de --project heimfriseur-dayplayer100
node scripts/firebase-assign-admin-company.mjs --project heimfriseur-dayplayer100 --from-admin dayplayer100@live.de --to-owner t-cut@web.de --delete-extra-company
```

Beide Firebase-Konten müssen bestätigt sein; T-cut muss bereits aktive Geschäftsführerin
sein. Das Betreiberwerkzeug nutzt Cloud-Shell-IAM. Vor dem Löschen schreibt es eine
private JSON-Sicherung mit Dateirechten 600 unter `~/.heimfriseur-backups/`.
Danach löscht es die zusätzliche Firma einschließlich der bekannten Unterkollektionen,
Einladungen und zugehöriger inaktiver Kontozuordnungen in einem geprüften Commit.
Weitere aktive Teammitglieder, laufende Behandlungen, konkurrierende Änderungen oder
zu große Datenmengen führen zum Abbruch. Bereits stillgelegte eigene Zusatzfirmen
werden ebenfalls gesichert und entfernt. Auth-Konten, Plattform-Admin-Rechte und
T-cuts Unternehmen samt Kundendaten bleiben erhalten. Die Sicherungsdatei enthält
personenbezogene Daten und darf nicht in Git oder öffentliche Downloads gelangen.

Ohne `--delete-extra-company` bleibt die bisherige Archivierung erhalten. Nach der
Zuordnung öffnet dayplayer100 direkt T-cuts Unternehmen über Plattformrechte. T-cut
kann anschließend zusätzlich eine Einladung mit der Rolle Administrator schicken;
dafür wird kein eigenes Unternehmen angelegt. Die echte Firebase-Änderung erfolgt
erst durch Ausführen des Betreiberbefehls, nicht allein durch den App-Build.

Validierung: TypeScript, beide Builds, lokale Tests, Firestore/Auth-Emulator mit
Rollenwechsel, Entzug von Finanzzugriff, gleicher Unternehmenszuordnung beim
Einladen, Erhalt historischer Beträge und Löschen erst nach Sicherung. Mobiler
Browser prüft zudem die tatsächliche Rollenänderung durch die Geschäftsführung.
