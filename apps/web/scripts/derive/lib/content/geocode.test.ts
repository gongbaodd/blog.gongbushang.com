import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { geocodeCities } from "./geocode.ts";
import type { MetadataEntry } from "./types.ts";

describe("geocodeCities", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("returns previous locations when API key is missing", async () => {
    const old: MetadataEntry = {
      file: "2024/test",
      hash: "abc",
      city: ["Tokyo"],
      locations: [{ latitude: 35.6762, longitude: 139.6503 }],
    };

    const result = await geocodeCities(["Tokyo"], undefined, old);

    expect(result).toEqual({
      city: ["Tokyo"],
      locations: old.locations,
    });
  });

  test("returns empty locations when API key is missing and no previous data", async () => {
    const result = await geocodeCities(["Tokyo"], undefined);

    expect(result).toEqual({
      city: ["Tokyo"],
      locations: [],
    });
  });

  test("reuses cached locations when city list is unchanged", async () => {
    const old: MetadataEntry = {
      file: "2024/test",
      hash: "abc",
      city: ["Tokyo", "Osaka"],
      locations: [
        { latitude: 35.6762, longitude: 139.6503 },
        { latitude: 34.6937, longitude: 135.5023 },
      ],
    };

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodeCities(["Tokyo", "Osaka"], "test-key", old);

    expect(result).toEqual({
      city: old.city,
      locations: old.locations,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetches coordinates for each city", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const address = new URL(url).searchParams.get("address");
        if (address === "Tokyo") {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                results: [{ geometry: { location: { lat: 35.6762, lng: 139.6503 } } }],
              }),
          });
        }
        if (address === "Osaka") {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                results: [{ geometry: { location: { lat: 34.6937, lng: 135.5023 } } }],
              }),
          });
        }
        return Promise.resolve({ json: () => Promise.resolve({ results: [] }) });
      }),
    );

    const result = await geocodeCities(["Tokyo", "Osaka"], "test-key");

    expect(result).toEqual({
      city: ["Tokyo", "Osaka"],
      locations: [
        { latitude: 35.6762, longitude: 139.6503 },
        { latitude: 34.6937, longitude: 135.5023 },
      ],
    });
  });

  test("skips cities with empty geocode results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ results: [] }),
        }),
      ),
    );

    const result = await geocodeCities(["Unknown City"], "test-key");

    expect(result).toEqual({
      city: ["Unknown City"],
      locations: [],
    });
  });

  test("continues when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network down"))),
    );

    const result = await geocodeCities(["Tokyo"], "test-key");

    expect(result).toEqual({
      city: ["Tokyo"],
      locations: [],
    });
  });
});
