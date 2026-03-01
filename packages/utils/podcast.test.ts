import { describe, expect, test, vi } from "vitest";

const readFileSyncMock = vi.fn();

vi.mock("node:fs", () => ({
  default: {
    readFileSync: (...args: unknown[]) => readFileSyncMock(...args),
  },
}));

vi.mock("../../src/content/podcast.json", () => ({
  default: {
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
  },
}));

import { processPodcastEpisodes, mapPodcastEpisodesToPosts } from "./podcast";

describe("processPodcastEpisodes", () => {
  test("returns episode unchanged when no image", () => {
    const result = processPodcastEpisodes();
    const noImage = result.find((ep) => ep.title === "Episode One");
    expect(noImage?.image).toBeUndefined();
    expect(noImage?.trace).toBeUndefined();
  });

  test("enriches episode with trace when SVG exists", () => {
    readFileSyncMock.mockReturnValue("<svg>trace</svg>");
    const result = processPodcastEpisodes();
    const withImage = result.find((ep) => ep.title === "Episode Two");
    expect(withImage?.trace).toBe("<svg>trace</svg>");
  });

  test("returns episode unchanged when SVG read fails", () => {
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = processPodcastEpisodes();
    const withImage = result.find((ep) => ep.title === "Episode Two");
    expect(withImage?.trace).toBeUndefined();
  });
});

describe("mapPodcastEpisodesToPosts", () => {
  test("maps episodes to post shape with category podcast", () => {
    readFileSyncMock.mockReturnValue("");
    const result = mapPodcastEpisodesToPosts();
    expect(result).toHaveLength(2);
    expect(result[0].data.category).toBe("podcast");
    expect(result[0].collection).toBe("blog");
    expect(result[0].data.title).toBe("Episode One");
    expect(result[0].data.date).toEqual(new Date("2024-01-15T00:00:00Z"));
    expect(result[0].data.body).toBe("Desc one");
  });
});
