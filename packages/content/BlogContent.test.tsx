/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogContent, { BlogMenu, RelatePosts } from "./BlogContent";
import type { IPost } from "@/packages/card/PostCard";

const mockPost: IPost = {
  id: "blog/2024/test",
  href: "/blog/2024/test",
  title: "Test Post",
  date: new Date("2024-06-01"),
  data: {
    category: "blog",
    layout: "md",
    bgClass: "",
    bgColor: "",
    titleColor: "",
    trace: "",
  },
  excerpt: "Excerpt",
};

const mockHeadings = [
  { slug: "section-1", text: "Section 1", depth: 2 },
  { slug: "section-2", text: "Section 2", depth: 3 },
];

const mockLinks = [
  { label: "Tag A", href: "/tag/a" },
  { label: "Tag B", href: "/tag/b" },
];

vi.mock("@/packages/card/PostCard", () => ({
  PostCard: ({ post }: { post: IPost }) => <div data-testid="post-card">{post.title}</div>,
}));

vi.mock("../carousel/BlogCarousel", () => ({
  Carousel: ({ posts }: { posts: IPost[] }) => (
    <div data-testid="carousel">{posts.length} posts</div>
  ),
}));

const requestMock = vi.fn();
const subscribeStub = vi.fn((cb: () => void) => {
  cb();
  return () => {};
});
vi.mock("@/src/stores/relates", () => ({
  $relates: {
    get: () => [
      { id: "blog/2024/test", title: "Test", href: "", date: new Date(), data: {} as IPost["data"], excerpt: "" },
      { id: "blog/2024/other", title: "Other", href: "", date: new Date(), data: {} as IPost["data"], excerpt: "" },
    ],
    set: vi.fn(),
    subscribe: subscribeStub,
  },
  $isLoading: { get: () => false, set: vi.fn(), subscribe: subscribeStub },
  request: requestMock,
}));

describe("BlogContent", () => {
  test("renders title, date, time and link badges", () => {
    render(
      <BlogContent
        title="My Blog Post"
        links={mockLinks}
        date={new Date("2024-05-15")}
        time="5 min read"
      >
        <p>Body</p>
      </BlogContent>
    );
    expect(screen.getByText("My Blog Post")).toBeInTheDocument();
    expect(screen.getByText("2024-05-15")).toBeInTheDocument();
    expect(screen.getByText("5 min read")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tag A" })).toHaveAttribute("href", "/tag/a");
    expect(screen.getByRole("link", { name: "Tag B" })).toHaveAttribute("href", "/tag/b");
  });

  test("renders children", () => {
    render(
      <BlogContent
        title="T"
        links={[]}
        date={new Date()}
        time="0 min"
      >
        <p data-testid="child">Child content</p>
      </BlogContent>
    );
    expect(screen.getByTestId("child")).toHaveTextContent("Child content");
  });
});

describe("BlogMenu", () => {
  test("renders PostCard, headings and tags", () => {
    render(
      <BlogMenu post={mockPost} headings={mockHeadings} links={mockLinks} />
    );
    expect(screen.getByTestId("post-card")).toHaveTextContent("Test Post");
    expect(screen.getByText("Headings")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Section 1" })).toHaveAttribute("href", "#section-1");
    expect(screen.getByRole("link", { name: "Section 2" })).toHaveAttribute("href", "#section-2");
    expect(screen.getByRole("link", { name: "Tag A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tag B" })).toBeInTheDocument();
  });
});

describe("RelatePosts", () => {
  beforeEach(() => {
    requestMock.mockClear();
  });

  test("calls request with category and renders Carousel with relates excluding id", () => {
    render(<RelatePosts id="blog/2024/test" category="blog" />);
    expect(requestMock).toHaveBeenCalledWith("blog");
    // relates = _relates.filter(p => p.id !== id) => one post excluded, so 1 post
    expect(screen.getByTestId("carousel")).toHaveTextContent("1 posts");
  });
});
