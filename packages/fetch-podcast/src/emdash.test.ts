import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli.ts";
import { episodeToFields } from "./emdash.ts";

describe("fetch-podcast --emdash", () => {
  it("maps an episode to the podcasts collection fields (ISO pub_date)", () => {
    const f = episodeToFields({
      id: "--e2iv0jd",
      title: "T",
      link: "https://x/y",
      pubDate: "Sun, 28 Apr 2024 07:30:00 GMT",
      description: "<p>d</p>",
      summary: "d",
      duration: "00:12:31",
      audioUrl: "https://a",
      image: "https://i",
    });
    expect(f).toMatchObject({ legacy_id: "--e2iv0jd", pub_date: "2024-04-28T07:30:00.000Z", audio_url: "https://a", image_url: "https://i" });
    expect(f).not.toHaveProperty("color_set");
  });

  it("parses --emdash and --dry-run; the legacy path stays the default", () => {
    expect(parseCliArgs(["--emdash", "http://127.0.0.1:4322", "--dry-run"])).toEqual({ emdash: "http://127.0.0.1:4322", dryRun: true });
    expect(parseCliArgs([]).emdash).toBeUndefined();
  });
});
