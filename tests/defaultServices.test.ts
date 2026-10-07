import { describe, it, expect } from "vitest";
import { defaultServices, authReturnUrl } from "../src/defaultServices";
describe("photo price list and invitation continuation", () => {
  it("retains all nine prices including cents from the supplied sheet", () => {
    expect(defaultServices.map((s) => s.price)).toEqual([
      22, 30, 19, 30, 60, 60, 18.5, 22, 5,
    ]);
    expect(new Set(defaultServices.map((s) => s.name)).size).toBe(9);
  });
  it("carries the invitation across email confirmation and reset into another tab", () => {
    const target = new URL(
      authReturnUrl("https://example.invalid", "token&with=symbols"),
    );
    expect(target.searchParams.get("invite")).toBe("token&with=symbols");
    expect(authReturnUrl("https://example.invalid", null)).toBe(
      "https://example.invalid",
    );
  });
});
