/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostCard, type IPost } from "./PostCard";

vi.mock("@/src/components/ViewCount", () => ({
  default: ({ path }: { path: string }) => <span data-testid="view-count">{path}</span>,
}));

const minimalPost: IPost = {
  id: "blog/2024/test-post",
  href: "/blog/2024/test-post",
  title: "Test Post Title",
  date: new Date("2024-06-15"),
  data: {
    category: "blog",
    layout: "md",
    bgClass: "liquid_cheese",
    bgColor: "#f0f0f0",
    titleColor: "--mantine-color-dark-8",
    trace: "<svg/>",
    cover: undefined,
  },
  excerpt: "Short excerpt text",
};

describe("PostCard", () => {
  test("renders title and link", () => {
    render(<PostCard post={minimalPost} />);
    expect(screen.getByText("Test Post Title")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /test post title/i });
    expect(link).toHaveAttribute("href", "/blog/2024/test-post");
  });

  test("renders date in YYYY-MM-DD format", () => {
    render(<PostCard post={minimalPost} />);
    expect(screen.getByText("2024-06-15")).toBeInTheDocument();
  });

  test("renders excerpt when hideExcerpt is false", () => {
    render(<PostCard post={minimalPost} hideExcerpt={false} />);
    expect(screen.getByText("Short excerpt text")).toBeInTheDocument();
  });

  test("does not render excerpt when hideExcerpt is true", () => {
    render(<PostCard post={minimalPost} hideExcerpt />);
    expect(screen.queryByText("Short excerpt text")).not.toBeInTheDocument();
  });

  test("renders category badge", () => {
    render(<PostCard post={minimalPost} />);
    expect(screen.getByText("blog")).toBeInTheDocument();
  });

  test("uses ViewCount with post href", () => {
    render(<PostCard post={minimalPost} />);
    const viewCount = screen.getByTestId("view-count");
    expect(viewCount).toHaveTextContent("/blog/2024/test-post");
  });
});
