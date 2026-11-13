import { describe, expect, it } from "vitest";
import { safeNext } from "./site";

describe("safeNext", () => {
  it("keeps same-origin paths, query and hash included", () => {
    expect(safeNext("/feed")).toBe("/feed");
    expect(safeNext("/event/abc?ref=share#tickets")).toBe("/event/abc?ref=share#tickets");
  });

  it("drops empty, absolute and protocol-relative values", () => {
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
  });

  // Browsers strip tab/CR/LF when parsing, turning these into "//evil.com".
  it("drops control-character and backslash smuggling", () => {
    expect(safeNext("/\t/evil.com")).toBeNull();
    expect(safeNext("/\n/evil.com")).toBeNull();
    expect(safeNext("/\r/evil.com")).toBeNull();
    expect(safeNext("/ok\\..\\evil")).toBeNull();
  });
});
