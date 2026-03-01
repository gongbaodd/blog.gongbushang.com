/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogCarousel, {
  Carousel,
  LatestCarousel,
  HistoryCarousel,
} from "./BlogCarousel";
import type { IPost } from "../card/PostCard";

const mockPost: IPost = {
  id: "blog/2024/a",
  href: "/blog/2024/a",
  title: "Post A",
  date: new Date("2024-01-01"),
  data: {
    category: "blog",
    layout: "md",
    bgClass: "",
    bgColor: "",
    titleColor: "",
    trace: "",
  },
  excerpt: "",
};

const mockPodcastPost: IPost = {
  ...mockPost,
  id: "podcast/2024/b",
  href: "/podcast/2024/b",
  title: "Podcast B",
  data: { ...mockPost.data, category: "podcast" },
};

vi.mock("@mantine/carousel", () => {
  const Slide = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  const Carousel = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel">{children}</div>
  );
  (Carousel as unknown as { Slide: typeof Slide }).Slide = Slide;
  return { Carousel };
});

vi.mock("../card/PostCard", () => ({
  PostCard: ({ post }: { post: IPost }) => (
    <div data-testid="post-card">{post.title}</div>
  ),
}));

vi.mock("@/packages/masonry/PodcastPlock", () => ({
  PodcastCardFromPost: ({ post }: { post: IPost }) => (
    <div data-testid="podcast-card">{post.title}</div>
  ),
}));

vi.mock("./latest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./latest")>();
  return { ...actual, requestLatestPosts: vi.fn() };
});

vi.mock("./history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./history")>();
  return { ...actual, requestHistoryPosts: vi.fn() };
});

describe("BlogCarousel", () => {
  test("renders title and link", () => {
    render(
      <BlogCarousel
        title="Latest Posts"
        posts={[mockPost]}
        link={{ label: "View All 10 Posts", href: "/all" }}
      />
    );
    expect(screen.getByText("Latest Posts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all 10 posts/i })).toHaveAttribute(
      "href",
      "/all"
    );
  });

  test("renders carousel with correct number of posts", () => {
    render(
      <BlogCarousel
        title="Test"
        posts={[mockPost, { ...mockPost, id: "blog/2024/c", title: "Post C" }]}
        link={{ label: "Link", href: "/x" }}
      />
    );
    const carousel = screen.getByTestId("carousel");
    expect(carousel).toBeInTheDocument();
    expect(screen.getByText("Post A")).toBeInTheDocument();
    expect(screen.getByText("Post C")).toBeInTheDocument();
  });
});

describe("Carousel", () => {
  test("renders PostCard for blog posts", () => {
    render(<Carousel posts={[mockPost]} />);
    expect(screen.getByTestId("post-card")).toBeInTheDocument();
    expect(screen.getByText("Post A")).toBeInTheDocument();
  });

  test("renders PodcastCardFromPost for podcast posts", () => {
    render(<Carousel posts={[mockPodcastPost]} />);
    expect(screen.getByTestId("podcast-card")).toBeInTheDocument();
    expect(screen.getByText("Podcast B")).toBeInTheDocument();
  });

  test("renders mixed post types correctly", () => {
    render(<Carousel posts={[mockPost, mockPodcastPost]} />);
    expect(screen.getByTestId("post-card")).toHaveTextContent("Post A");
    expect(screen.getByTestId("podcast-card")).toHaveTextContent("Podcast B");
  });
});

describe("LatestCarousel", () => {
  test("renders title and link with total count from store", async () => {
    const { $latest, $totalCounts } = await import("./latest");
    $latest.set([mockPost]);
    $totalCounts.set(42);
    render(<LatestCarousel />);
    expect(screen.getByText("Latest Posts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all 42 posts/i })).toBeInTheDocument();
  });
});

describe("HistoryCarousel", () => {
  test("renders title and link", async () => {
    const { $history } = await import("./history");
    $history.set([mockPost]);
    render(<HistoryCarousel />);
    expect(screen.getByText("Time Machine")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view archivess/i })).toHaveAttribute(
      "href",
      "/year"
    );
  });
});
