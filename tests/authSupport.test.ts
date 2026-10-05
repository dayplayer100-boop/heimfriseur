import { describe, it, expect } from "vitest";
import { assertPublicSupabaseKey } from "../src/publicConnection";
import { authError } from "../src/authSupport";
describe("Deutsche Auth-Fehler", () => {
  it("erkennt unbestätigte E-Mail und SMTP-Ausfall", () => {
    expect(authError({ code: "email_not_confirmed" })).toContain("bestätige");
    expect(
      authError({ message: "Error sending confirmation email" }),
    ).toContain("Supabase");
    expect(authError({ code: "email_address_not_authorized" })).toContain(
      "versendet",
    );
  });
  it("gibt keine internen Serverdetails oder Kontoexistenz preis", () => {
    expect(
      authError({ message: "Database error saving new user: private details" }),
    ).not.toContain("private details");
    expect(authError({ message: "User already registered" })).not.toContain(
      "bereits registriert",
    );
    expect(authError({ code: "over_email_send_rate_limit" })).toContain(
      "Zu viele",
    );
  });
});

describe("Keine privaten Schlüssel im Build", () => {
  it("akzeptiert nur Publishable und Anon", () => {
    expect(() =>
      assertPublicSupabaseKey("sb_publishable_fixture"),
    ).not.toThrow();
    expect(() =>
      assertPublicSupabaseKey(
        "a." + btoa(JSON.stringify({ role: "anon" })) + ".c",
      ),
    ).not.toThrow();
    expect(() => assertPublicSupabaseKey("sb_secret_fixture")).toThrow();
    expect(() =>
      assertPublicSupabaseKey(
        "a." + btoa(JSON.stringify({ role: "service_role" })) + ".c",
      ),
    ).toThrow();
    expect(() => assertPublicSupabaseKey("invalid")).toThrow();
  });
});
