export const ERROR_MESSAGES: Record<string, string> = {
  HF_PLAN_INCOMPLETE:
    "Die Kundenplanung wurde unterbrochen. Bitte beim Besuch „Planung vervollständigen“ wählen.",
  HF_ACCESS_DENIED:
    "Du hast keinen Zugriff. Bitte erneut anmelden oder die Geschäftsführung kontaktieren.",
  HF_CONFLICT:
    "Daten wurden parallel geändert. Bitte neu laden und erneut versuchen.",
  HF_INVALID_TIME: "Behandlungsende muss nach dem Beginn liegen.",
  HF_DATA_LIMIT: "Zu viele Datensätze. Bitte den Betreiber kontaktieren.",
  HF_OFFLINE: "Keine Verbindung. Bitte Internetverbindung prüfen.",
  HF_QUOTA:
    "Zu viele Anfragen oder das kostenlose Kontingent ist erreicht. Bitte später erneut versuchen.",
  HF_FAILED:
    "Die Aktion konnte nicht abgeschlossen werden. Bitte Eingaben und Verbindung prüfen.",
  HF_FOLLOWUP_NEEDED:
    "Besuch ist abgeschlossen. Folgetermin fehlt; Abschluss erneut aufrufen oder Geschäftsführung informieren.",
};
export function normalizeAppError(error: unknown): Error & { code: string } {
  const code = (error as { code?: string })?.code || "";
  const translated: Record<string, string> = {
    "42501": "HF_ACCESS_DENIED",
    "permission-denied": "HF_ACCESS_DENIED",
    unauthenticated: "HF_ACCESS_DENIED",
    unavailable: "HF_OFFLINE",
    "auth/network-request-failed": "HF_OFFLINE",
    aborted: "HF_CONFLICT",
    "failed-precondition": "HF_CONFLICT",
    "resource-exhausted": "HF_QUOTA",
  };
  const normalized = ERROR_MESSAGES[code]
    ? code
    : translated[code] || "HF_FAILED";
  return Object.assign(new Error(ERROR_MESSAGES[normalized]), {
    code: normalized,
  });
}
