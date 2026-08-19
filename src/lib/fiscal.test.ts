import { describe, expect, it } from "vitest";
import { normalizeFiscalId, toFiscalIdentity, validateFiscalInput } from "./fiscal";

describe("normalizeFiscalId", () => {
  it("uppercases and strips spaces and punctuation", () => {
    expect(normalizeFiscalId("es b-1234 5678")).toBe("ESB12345678");
    expect(normalizeFiscalId("  12345678-z ")).toBe("12345678Z");
  });
});

describe("validateFiscalInput", () => {
  const base = {
    legalName: "Sala But SL",
    fiscalId: "B12345678",
    fiscalIdType: "nif",
    country: "ES",
    address: "Calle X 1, Madrid",
  };

  it("accepts a well-formed Spanish NIF", () => {
    expect(validateFiscalInput(base)).toBeNull();
  });

  it("requires a legal name", () => {
    expect(validateFiscalInput({ ...base, legalName: "  " })).toBe("legalNameRequired");
  });

  it("rejects an implausibly short id", () => {
    expect(validateFiscalInput({ ...base, fiscalId: "12" })).toBe("fiscalIdInvalid");
  });

  it("rejects an unknown id type", () => {
    expect(validateFiscalInput({ ...base, fiscalIdType: "passport" })).toBe("fiscalIdTypeInvalid");
  });

  it("requires a two-letter country", () => {
    expect(validateFiscalInput({ ...base, country: "Spain" })).toBe("countryInvalid");
  });

  it("accepts an EU VAT number with a country prefix", () => {
    expect(
      validateFiscalInput({ ...base, fiscalIdType: "vat", fiscalId: "ESB12345678" })
    ).toBeNull();
  });
});

describe("toFiscalIdentity", () => {
  it("normalises id and country and trims the name and address", () => {
    const out = toFiscalIdentity({
      legalName: "  Sala But SL ",
      fiscalId: "b-1234 5678",
      fiscalIdType: "nif",
      country: "es",
      address: "  Calle X 1  ",
    });
    expect(out).toEqual({
      legalName: "Sala But SL",
      fiscalId: "B12345678",
      fiscalIdType: "nif",
      country: "ES",
      address: "Calle X 1",
    });
  });
});
