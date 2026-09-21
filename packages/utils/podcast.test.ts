import { describe, expect, test, vi } from "vitest";

const podcastManifest = {
  channel: { title: "Test Podcast" },
};

const podcastEpisodes = [
  {
    id: "ep1",
    title: "Episode One",
    link: "https://example.com/ep1",
    pubDate: "2024-01-15T00:00:00Z",
    description: "Desc one",
    summary: "Summary one",
  },
  {
    id: "ep2",
    title: "Episode Two",
    link: "https://example.com/ep2",
    pubDate: "2024-02-20T00:00:00Z",
    description: "Desc two",
    summary: "Summary two",
    image: "https://example.com/img.png",
  },
];

vi.mock("node:fs", () => ({
  default: {
    existsSync: (filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith("podcast.json")) return true;
      if (p.endsWith("podcast")) return true;
      return false;
    },
    readdirSync: (dirPath: unknown) => {
      const p = String(dirPath);
      if (p.endsWith("podcast")) return ["ep1.json", "ep2.json"];
      return [];
    },
    readFileSync: (filePath: unknown) => {
      const p = String(filePath);
      if (p.endsWith("podcast.json")) return JSON.stringify(podcastManifest);
      if (p.endsWith("ep1.json")) {
        return JSON.stringify(podcastEpisodes[0]);
      }
      if (p.endsWith("ep2.json")) {
        return JSON.stringify(podcastEpisodes[1]);
      }
      throw new Error(`Unexpected read: ${p}`);
    },
  },
}));

import { processPodcastEpisodes, mapPodcastEpisodesToPosts, readPodcastData } from "./podcast";

describe("readPodcastData", () => {
  test("returns parsed podcast data", () => {
    const data = readPodcastData();
    expect(data.episodes).toHaveLength(2);
    expect(data.channel.title).toBe("Test Podcast");
  });
});

describe("processPodcastEpisodes", () => {
  test("returns episodes without trace data", () => {
    const result = processPodcastEpisodes();
    expect(result).toHaveLength(2);
    for (const episode of result) {
      expect(episode).not.toHaveProperty("trace");
    }
    const withImage = result.find((ep) => ep.title === "Episode Two");
    expect(withImage?.image).toBe("https://example.com/img.png");
  });
});

describe("mapPodcastEpisodesToPosts", () => {
  test("maps episodes to post shape with category podcast", () => {
    const result = mapPodcastEpisodesToPosts();
    expect(result).toHaveLength(2);
    expect(result[0].data.category).toBe("podcast");
    expect(result[0].collection).toBe("blog");
    expect(result[0].data.title).toBe("Episode Two");
    expect(result[0].data.date).toEqual(new Date("2024-02-20T00:00:00Z"));
    expect(result[1].data.title).toBe("Episode One");
    expect(result[1].data.body).toBe("Desc one");
    expect(result[0].data).not.toHaveProperty("trace");
  });
});
