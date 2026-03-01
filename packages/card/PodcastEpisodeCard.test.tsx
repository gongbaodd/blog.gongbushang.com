/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { PodcastEpisodeCard } from "./PodcastEpisodeCard";
import type { IPodcastEpisode } from "@/src/stores/podcast";

const minimalEpisode: IPodcastEpisode = {
  id: "https://example.com/ep1",
  title: "Episode One",
  link: "https://example.com/ep1",
  pubDate: "2024-01-15T00:00:00Z",
  description: "Plain text description",
};

const episodeWithSummary: IPodcastEpisode = {
  ...minimalEpisode,
  summary: "<p>HTML <b>summary</b> here</p>",
};

const episodeWithDuration: IPodcastEpisode = {
  ...minimalEpisode,
  duration: "42:00",
  audioUrl: "https://example.com/audio.mp3",
};

describe("PodcastEpisodeCard", () => {
  test("renders episode title and link", () => {
    render(<PodcastEpisodeCard episode={minimalEpisode} />);
    expect(screen.getByText("Episode One")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /episode one/i });
    expect(link).toHaveAttribute("href", "https://example.com/ep1");
  });

  test("renders pubDate in YYYY-MM-DD format", () => {
    render(<PodcastEpisodeCard episode={minimalEpisode} />);
    expect(screen.getByText("2024-01-15")).toBeInTheDocument();
  });

  test("renders stripped excerpt from description", () => {
    render(<PodcastEpisodeCard episode={minimalEpisode} />);
    expect(screen.getByText("Plain text description")).toBeInTheDocument();
  });

  test("renders stripped excerpt from summary when present", () => {
    render(<PodcastEpisodeCard episode={episodeWithSummary} />);
    expect(screen.getByText("HTML summary here")).toBeInTheDocument();
  });

  test("hides excerpt when hideExcerpt is true", () => {
    render(<PodcastEpisodeCard episode={minimalEpisode} hideExcerpt />);
    expect(screen.queryByText("Plain text description")).not.toBeInTheDocument();
  });

  test("renders duration and Listen link when provided", () => {
    render(<PodcastEpisodeCard episode={episodeWithDuration} />);
    expect(screen.getByText("42:00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /listen/i })).toHaveAttribute(
      "href",
      "https://example.com/audio.mp3"
    );
  });
});
