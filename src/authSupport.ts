export function authRedirect(invitation: string | null = null) {
  return (
    location.origin +
    (invitation ? "/?invite=" + encodeURIComponent(invitation) : "/")
  );
}
export function authError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (
    e.code === "email_not_confirmed" ||
    /email not confirmed/i.test(e.message || "")
  )
    return "Bitte bestätige zuerst deine E-Mail-Adresse. Du kannst die Bestätigung erneut anfordern.";
  if (
    e.code === "over_email_send_rate_limit" ||
    /rate limit/i.test(e.message || "")
  )
    return "Zu viele Anfragen. Bitte etwas später erneut versuchen.";
  if (
    e.code === "email_address_not_authorized" ||
    /Error sending|SMTP|email address.*not authorized/i.test(e.message || "")
  )
    return "Die Bestätigungsmail konnte nicht versendet werden. Bitte den App-Betreiber informieren; der E-Mail-Versand in Supabase muss geprüft werden.";
  if (e.code === "access_denied")
    return "Die Google-Anmeldung wurde abgebrochen oder nicht erlaubt. Du kannst sie erneut versuchen.";
  if (e.code === "weak_password")
    return "Bitte ein stärkeres Passwort mit mindestens 12 Zeichen verwenden.";
  if (
    e.code === "provider_disabled" ||
    /provider.*not enabled/i.test(e.message || "")
  )
    return "Google-Anmeldung ist noch nicht freigeschaltet. Bitte den App-Betreiber informieren.";
  if (/Invalid login/i.test(e.message || ""))
    return "E-Mail oder Passwort ist nicht korrekt.";
  return "Anmeldung fehlgeschlagen. Bitte Verbindung und Eingaben prüfen.";
}
