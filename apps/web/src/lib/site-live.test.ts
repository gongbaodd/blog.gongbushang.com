import { describe, expect, it } from "vitest";
import { isSiteLive } from "./site-live";

describe("isSiteLive (fail closed)", () => {
  it("is live only for the exact string true", () => {
    expect(isSiteLive("true")).toBe(true);
  });
  it("is not live when unset", () => {
    expect(isSiteLive(undefined)).toBe(false);
    expect(isSiteLive(null)).toBe(false);
    expect(isSiteLive("")).toBe(false);
  });
  it("is not live for false", () => {
    expect(isSiteLive("false")).toBe(false);
  });
  it("is not live for case variants, typos, whitespace or truthy lookalikes", () => {
    for (const v of ["TRUE", "True", "tru", "ture", " true", "true ", "1", "yes", "on", "production", true, 1]) {
      expect(isSiteLive(v), String(v)).toBe(false);
    }
  });
});
