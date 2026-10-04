import { describe, expect, it } from "vitest";
import { parseCustomerForm } from "../src/photoParsing";
describe("Editable intake proposals", () => {
  it("extracts printed resident fields while excluding guardian and billing text", () => {
    expect(
      parseCustomerForm(
        "Bewohner: Beispiel, Erika Wohnbereich: 1\nZimmer: 104\nName, Vorname: Andere, Person\nFriseur gewünscht: Ja",
      ),
    ).toEqual({
      first_name: "Erika",
      last_name: "Beispiel",
      room_number: "104",
      hair_request: "Ja",
    });
  });
  it("does not invent illegible names or unmarked consent", () => {
    expect(
      parseCustomerForm(
        "Informationen und Auftrag zum Friseur\nBewohner: unleserlich\nZimmer:\nEs wird der Friseur gewünscht\n2. Es wird keine Friseur gewünscht\nName",
      ),
    ).toEqual({});
  });
  it("recognizes unambiguous marks and leaves conflicting marks undecided", () => {
    expect(
      parseCustomerForm(
        "Es wird der Friseur gewünscht X\n2. Es wird keine Friseur gewünscht\nBewohner",
      ),
    ).toEqual({ hair_request: "Ja" });
    expect(
      parseCustomerForm(
        "Es wird der Friseur gewünscht X\n2. Es wird keine Friseur gewünscht X\nBewohner",
      ),
    ).toEqual({ hair_request: "Unbekannt" });
  });
});
