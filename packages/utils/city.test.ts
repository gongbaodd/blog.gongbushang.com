import { describe, expect, test } from "vitest";
import { citySlug, findCityBySlug } from "./city";

describe("citySlug", () => {
  test("lowercases and replaces comma with hyphen", () => {
    expect(citySlug("Dalian, China")).toBe("dalian-china");
    expect(citySlug("Prague, Czechia")).toBe("prague-czechia");
  });

  test("removes spaces and special characters", () => {
    expect(citySlug("San Sebastián, Spain")).toBe("san-sebastian-spain");
    expect(citySlug("Pärnu, Estonia")).toBe("parnu-estonia");
    expect(citySlug("Lääne-Virumaa, Estonia")).toBe("laane-virumaa-estonia");
  });

  test("trims whitespace", () => {
    expect(citySlug("  Berlin, Germany  ")).toBe("berlin-germany");
  });
});

describe("findCityBySlug", () => {
  test("finds original city label from slug", () => {
    const cities = ["Prague, Czechia", "Berlin, Germany"];
    expect(findCityBySlug(cities, "prague-czechia")).toBe("Prague, Czechia");
    expect(findCityBySlug(cities, "unknown-city")).toBeUndefined();
  });
});
