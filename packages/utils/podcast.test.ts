import { describe, expect, test, vi, beforeEach } from "vitest";

const podcastFixture = {
  channel: { title: "Test Podcast" },
  episodes: [
    {
      id: "https://example.com/ep1",
      title: "Episode One",
      link: "https://example.com/ep1",
      pubDate: "2024-01-15T00:00:00Z",
      description: "Desc one",
      summary: "Summary one",
    },
    {
      id: "https://example.com/ep2",
      title: "Episode Two",
      link: "https://example.com/ep2",
      pubDate: "2024-02-20T00:00:00Z",
      description: "Desc two",
      image: "https://example.com/img.png",
    },
  ],
};

let svgExists = false;
let svgReadFails = false;

vi.mock("node:fs", () => ({
  default: {
    existsSync: (filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith("podcast.json")) return true;
      if (p.endsWith(".svg")) return svgExists;
      return false;
    },
    readFileSync: (filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith("podcast.json")) return JSON.stringify(podcastFixture);
      if (p.endsWith(".svg")) {
        if (svgReadFails) throw new Error("ENOENT");
        return "<svg>trace</svg>";
      }
      throw new Error(`Unexpected read: ${p}`);
    },
  },
}));

import {
  processPodcastEpisodes,
  mapPodcastEpisodesToPosts,
  readPodcastData,
  readPodcastCoverSvg,
} from "./podcast";

describe("readPodcastData", () => {
  test("returns parsed podcast data", () => {
    const data = readPodcastData();
    expect(data.episodes).toHaveLength(2);
    expect(data.channel.title).toBe("Test Podcast");
  });
});

describe("readPodcastCoverSvg", () => {
  beforeEach(() => {
    svgExists = true;
    svgReadFails = false;
  });

  test("returns svg content when file exists", () => {
    expect(readPodcastCoverSvg("ep2")).toBe("<svg>trace</svg>");
  });

  test("returns undefined when file missing", () => {
    svgExists = false;
    expect(readPodcastCoverSvg("missing")).toBeUndefined();
  });
});

describe("processPodcastEpisodes", () => {
  beforeEach(() => {
    svgExists = false;
    svgReadFails = false;
  });

  test("returns episode unchanged when no image", () => {
    const result = processPodcastEpisodes();
    const noImage = result.find((ep) => ep.title === "Episode One");
    expect(noImage?.image).toBeUndefined();
    expect(noImage?.trace).toBeUndefined();
  });

  test("enriches episode with trace when SVG exists", () => {
    svgExists = true;
    const result = processPodcastEpisodes();
    const withImage = result.find((ep) => ep.title === "Episode Two");
    expect(withImage?.trace).toBe("<svg>trace</svg>");
  });

  test("returns episode unchanged when SVG read fails", () => {
    svgExists = true;
    svgReadFails = true;
    const result = processPodcastEpisodes();
    const withImage = result.find((ep) => ep.title === "Episode Two");
    expect(withImage?.trace).toBeUndefined();
  });
});

describe("mapPodcastEpisodesToPosts", () => {
  test("maps episodes to post shape with category podcast", () => {
    svgExists = false;
    const result = mapPodcastEpisodesToPosts();
    expect(result).toHaveLength(2);
    expect(result[0].data.category).toBe("podcast");
    expect(result[0].collection).toBe("blog");
    expect(result[0].data.title).toBe("Episode One");
    expect(result[0].data.date).toEqual(new Date("2024-01-15T00:00:00Z"));
    expect(result[0].data.body).toBe("Desc one");
  });
});
