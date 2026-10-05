# HeimFriseur 6.1 – Anmeldung und Schutz von Kundendaten

## Was tatsächlich geändert wurde

- Google-Anmeldung läuft über Supabase OAuth mit PKCE (S256). Es werden nur `openid email profile` angefordert, keine Kalender-/Drive-Daten. Team-Einladungen bleiben über den Rücksprung erhalten. Google vergibt keine Admin-/Mitarbeiterrolle; diese stammt aus der Datenbank. Eine Google-Adresse muss für eine Einladung der eingeladenen, bestätigten Adresse entsprechen.
- Bestätigung erneut senden mit Wartezeit, verständliche Meldungen für fehlende Bestätigung, Versandfehler und Rate Limits. Registrierung/Passwort-Reset versprechen nicht, dass ein Konto existiert oder eine Mail tatsächlich angekommen ist. Der Code kann einen falsch konfigurierten SMTP-Dienst nicht reparieren.
- Neue/geänderte Passwörter benötigen im Formular mindestens zwölf Zeichen; vorhandene Passwörter bleiben zum Anmelden zulässig. Die verbindliche Mindestlänge ebenfalls in Supabase setzen.
- Einstellungen → App → Kontosicherheit bietet TOTP-Einrichtung. Nach Aktivierung muss bei künftigen Anmeldungen ein sechsstelliger Authenticator-Code bestätigt werden. Bei aktiviertem MFA sperrt Migration 008 sowohl RLS-Datenabrufe als auch Geschäfts-RPCs ohne AAL2. Die Prüfung benutzt den tatsächlich angemeldeten Nutzer, auch in bestehenden intern auf den Eigentümer umgeschalteten RPCs. Geschäftsführer-MFA blockiert deshalb keine berechtigte Mitarbeiterbehandlung.
- Datenbankzugriff setzt eine bestätigte Adresse voraus. Rollen, Firmenzuordnung, Einladungen und App-Admin-Registry bleiben serverseitig geschützt. Migration 008 ändert keine vorhandenen Rollen oder Firmendaten. SQL-Bootstrap und interne Funktionen sind nicht für Browserkonten ausführbar. Auch erhaltene Legacy-Funktionen bekommen einen festen Suchpfad mit `pg_catalog` zuerst und `pg_temp` zuletzt. Mitarbeiter erhalten weiterhin nur zugewiesene Daten und keine historischen Geschäftszahlen.
- Das fest konfigurierte Supabase-Projekt hat Vorrang vor alten Browser-Einstellungen und lässt sich in dieser Veröffentlichung nicht über das Einstellungsformular ersetzen.
- Hosting erhält CSP, Schutz gegen Einbettung/Clickjacking, `nosniff`, HSTS, keine Referrer und eine eingeschränkte Permissions Policy. CSP erlaubt lokale OCR/WebAssembly und benötigt für bestehende dynamische Layouts Inline-Stile; Inline-Skripte und `unsafe-eval` sind nicht erlaubt. Externe Google-Fonts entfernt: Systemschriften, keine Schriftabrufe bei Google. PDF-Logos von beliebigen Fremdservern können durch CSP nicht mehr geladen werden; erlaubte Supabase-Storage-URLs verwenden.
- jsPDF auf 4.2.1 und Vitest auf 5.0.3 aktualisiert. Der bekannte kritische PDF-Befund und die Testtool-Befunde sind dadurch behoben. Zum Prüfzeitpunkt meldet `npm audit` keine bekannten Befunde. GitHub prüft künftig Abhängigkeiten vor Tests/Build.
- Browserprüfungen simulieren SMTP-Fehler, erneuten Versand, Google-PKCE-Anforderung und MFA-Gate. SQL-Prüfungen testen unbestätigte Konten, AAL1/AAL2, Rollentrennung, RLS, anonyme Rechte und interne Funktionen. Der aktuelle lokale Prüfstand umfasst 67 Tests und erfolgreiche Browser-/Buildprüfungen. PDF, OCR, Teamabläufe und Installation werden zusätzlich geprüft.

## E-Mail-Bestätigung wirklich zum Laufen bringen

1. Supabase → Authentication → Sign In / Providers → Email: **Confirm email aktivieren**.
2. Supabase → Authentication → Email → SMTP Settings: eigenen SMTP-Dienst einrichten. Der eingebaute Standardversand ist für Tests gedacht, eingeschränkt und kann die Empfänger auf Mitglieder der Supabase-Organisation beschränken. Ein 200-Ergebnis bei Signup beweist keine Mailzustellung. Auth-Logs prüfen, bevor eine konkrete Ursache behauptet wird.
3. Einen SMTP-Dienst wählen, dessen Absenderadresse/Domain du verifizieren kannst. Host, Port, Absender und Zugangsdaten **nur in Supabase** eingeben, niemals in Browser-Code, GitHub oder Chat. SPF/DKIM nach Anbieter-Anleitung einrichten, damit Yahoo/Web.de die Mails nicht als Spam ablehnen. Falls eigener Dienst bereits aktiv ist: Senderfreigabe, Quoten, Sperren, TLS/Port und Provider-Logs prüfen.
4. Authentication → URL Configuration:
   - Site URL: `https://heimfriseur-app.web.app`
   - erlaubte Redirect URL: `https://heimfriseur-app.web.app/**`
   - keine beliebigen fremden Domains/Wildcards als Rücksprung zulassen; alte unbenutzte Domains entfernen.
5. In der Bestätigungsvorlage den Supabase-Platzhalter `{{ .ConfirmationURL }}` als Link verwenden. Keine selbst gebastelten Token-Links. Einen echten neuen Testnutzer registrieren, Mail öffnen und erst danach anmelden. Nicht mit Kundenkonten testen und keine Konten löschen, um eine Mail erneut zu senden.
6. Ein existierender bereits bestätigter Google-Nutzer braucht keine zusätzliche Signup-Bestätigungsmail. Bei bestehenden unbestätigten Konten „Bestätigung erneut senden“ nutzen.

## Google-Anmeldung freischalten

1. Google Cloud Console im vorhandenen Projekt öffnen: APIs & Services / Google Auth Platform. App-Name HeimFriseur, Supportadresse, Audience und Branding einrichten.
2. OAuth Client **Web application** erstellen.
   - Authorized JavaScript origin: `https://heimfriseur-app.web.app`
   - Authorized redirect URI: **`https://bvqysdiofglgxqtydeko.supabase.co/auth/v1/callback`**
   - Google leitet zuerst zu Supabase zurück, Supabase anschließend zur App. Die Website-Adresse ist nicht der Google-Callback.
3. Supabase → Authentication → Sign In / Providers → Google aktivieren. Client ID und Client Secret aus Google dort eintragen. **Client Secret niemals in Frontend, GitHub, Chat oder VITE-Variablen.** „Skip nonce checks“ nicht aktivieren. Keine automatische Berechtigung aus Google-Metadaten ableiten.
4. Im Google-Testmodus müssen die gewünschten Konten als Testnutzer eingetragen sein. Für allgemeine Anmeldung die Google-App passend veröffentlichen; mögliche Google-Prüfungen richten sich nach den tatsächlich angeforderten Berechtigungen.
5. Website und installierte App testen, auch Rücksprung einer Mitarbeiter-Einladung. Google-Anmeldung darf kein neues Unternehmen initialisieren, solange eine Team-Einladung aussteht. PKCE-Rücksprung im selben Browser abschließen; Bestätigungs-/Reset-Links ebenfalls möglichst dort öffnen, wo sie angefordert wurden.

## Zwei-Faktor-Schutz einrichten und betreiben

- In Supabase TOTP unter Authentication/MFA zulassen, dann Einstellungen → App → Kontosicherheit → Authenticator verbinden. QR-Code scannen, Code bestätigen. Die Einrichtung ist erst nach Bestätigung aktiv. Nicht abgeschlossene Einrichtung kann abgebrochen werden.
- Für App-Admins und Geschäftsführer dringend einrichten. Neue Veröffentlichung erzwingt keinen ungeprüften sofortigen MFA-Zwang für alle bestehenden Konten: vorhandene Konten werden nicht ausgesperrt. Sobald ein Faktor verifiziert ist, setzt die Datenbank jedoch AAL2 voraus.
- Für verlorene Authenticator-Zugänge: Betreiber prüft Identität und entfernt den betroffenen Faktor ausschließlich über die geschützte Supabase-Administration. Keine Recovery-Funktion im Browser darf diese Prüfung umgehen. Eigene Wiederherstellungs-/Notfallabläufe und zweite vertrauenswürdige Adminperson organisieren. Die App implementiert keine Backup-Codes.
- Supabase-/Google-/GitHub-Betreiberkonten ebenfalls mit MFA schützen. Firmenmitarbeiter niemals als Supabase-Projektadministratoren einladen.

## Veröffentlichung

Voraussetzung: 001–007 installiert. Den vollständigen Inhalt von `supabase/migrations/008_auth_security.sql` einmal im Supabase SQL Editor ausführen. SQL 007 gegebenenfalls zuvor installieren, alte Migrationen nicht wiederholen. Es werden keine Kundendaten verschoben oder gelöscht. Das frühere Skript `employee-access.sql` nicht für dieses Update ausführen; es dient einer gesonderten Kontokorrektur.

Cloud Shell:

```bash
cd ~/heimfriseur
git pull origin main
npm ci
npm run build
npx --yes --package firebase-tools firebase deploy --only hosting --config firebase.clean.json --project heimfriseur-dayplayer100
```

Node mindestens 22.12, Ausgabe `dist`. Website und PWA verwenden dieselbe Veröffentlichung, Version 6.1.0 sicher laden. Öffentliche Variablen unverändert `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Ein Publishable-Key darf öffentlich sein; RLS und geprüfte Funktionen schützen die Daten. Service-Role-/SMTP-/Google-Secret gehören nicht ins Frontend. Der Build bricht ab, wenn ein privater Schlüssel als öffentliche VITE-Variable eingesetzt wird. Die Data API darf nur die vorgesehenen öffentlichen Schemas exponieren, nicht `heimfriseur_private` oder `auth`.

## Verbleibende betriebliche Aufgaben und Grenzen

Die Prüfung ist kein externes Penetrationstest-Zertifikat und keine Garantie absoluter Sicherheit. Supabase-, SMTP- und Google-Einstellungen sowie reale Mailzustellung können ohne Betreiberzugang hier nicht geprüft oder geändert werden. Erst nach deren Einrichtung funktioniert echte Google-Anmeldung/E-Mail-Zustellung. Ein vollständiger Live-Test mit eigenen fiktiven Testdaten bleibt erforderlich.

- Supabase-Backups mit einem getesteten Wiederherstellungsweg einrichten; Verfügbarkeit hängt vom Tarif ab. JSON-Export enthält sensible Daten und ersetzt keine vollständige Datenbanksicherung. Export/PDF nur auf geschützten Geräten speichern und kontrolliert weitergeben.
- Auth-Rate-Limits und ggf. Bot-Schutz in Supabase angemessen setzen; CAPTCHA benötigt zusätzliche Provider-Konfiguration und ist in diesem Update nicht eingebaut. Passwort-Mindestlänge serverseitig auf 12 setzen. Schutz vor geleakten Passwörtern aktivieren, falls der Tarif ihn bietet. Endliche JWT-Laufzeit und angemessene Sitzungsregeln festlegen.
- Browser/PWA speichert Auth-Sitzung im Browser, keine Kundendaten im Service-Worker-Offlinecache. Kein vollständiger Offline-Datenschutzspeicher. Geräte sperren, aktuelle Browser nutzen, verlorene Geräte/Sitzungen widerrufen. Bei Netzstörung kann ein offener Bildschirm bis zur nächsten erfolgreichen Rechteprüfung sichtbar bleiben; Widerruf kann kein bereits heruntergeladenes PDF oder Screenshot zurückholen.
- Geschäftsdaten im Arbeitsspeicher verschwinden beim Abmelden bzw. bei erkanntem Rechteentzug. Automatisches Logout mitten in einer laufenden Behandlung ist nicht ergänzt, um ungesicherte Änderungen nicht still zu verwerfen. Gemeinsame Geräte erfordern konsequentes Abmelden.
- Firmenzugriff und Mitarbeiterzuweisung regelmäßig prüfen. App-Admin besitzt ausdrücklich umfassende Rechte; deshalb starkes Konto, MFA und Protokollkontrolle. Zahlungs-/Behandlungskorrekturen sind nachvollziehbar, technische Adminänderungen werden separat protokolliert. Protokolle nicht mit Fotos/privaten Notizen unnötig füllen.
- Auftragsverarbeitung, Zweckbindung, Zugriffsbeschränkung, Datensparsamkeit und Aufbewahrungs-/Löschfristen organisatorisch festlegen. Angaben zu Krankheiten und Bewohnerformulare können besonders sensible Daten enthalten. Lokales OCR lädt das Foto nicht zu einem externen OCR-Anbieter hoch; keine automatischen Fotoarchive anlegen. Die App behauptet kein automatisch rechtskonformes Gesamtsystem.
