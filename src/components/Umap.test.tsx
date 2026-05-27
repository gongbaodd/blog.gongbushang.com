/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import {
  $umapError,
  $umapLoading,
  $umapPosts,
  type IUmapPost,
} from "@/src/stores/umap";

vi.mock("@/src/stores/umap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/stores/umap")>();
  return {
    ...actual,
    requestUmapData: vi.fn(),
  };
});

vi.mock("@mantine/charts", () => ({
  ScatterChart: ({
    data,
  }: {
    data?: { data?: unknown[] }[];
  }) => (
    <div
      data-testid="scatter-chart"
      data-count={data?.[0]?.data?.length ?? 0}
    />
  ),
}));

import Umap, { UmapTooltip } from "./Umap";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";

function renderWithMantine(ui: ReactNode) {
  return render(<CustomMantineProvider>{ui}</CustomMantineProvider>);
}

const samplePosts: IUmapPost[] = [
  {
    id: "blog/2024/a",
    href: "/blog/2024/a",
    title: "Post A",
    date: "2024-01-15",
    umap2D: [0.1, 0.2],
  },
];

function mockMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function resetStore() {
  $umapPosts.set([]);
  $umapLoading.set(false);
  $umapError.set(null);
}

describe("Umap", () => {
  beforeEach(() => {
    mockMatchMedia();
    resetStore();
  });
  afterEach(() => {
    cleanup();
    resetStore();
  });

  test("shows loader while loading", () => {
    $umapLoading.set(true);

    render(<Umap />);

    expect(screen.getByTestId("umap-loader")).toBeTruthy();
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  test("shows error message on failure", () => {
    $umapError.set("Not Found");

    render(<Umap />);

    expect(screen.getByText("Not Found")).toBeTruthy();
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  test("shows empty fallback when no posts", () => {
    render(<Umap />);

    expect(screen.getByText(/no posts with umap/i)).toBeTruthy();
    expect(screen.queryByTestId("scatter-chart")).toBeNull();
  });

  test("renders scatter chart when posts are available", () => {
    $umapPosts.set(samplePosts);

    render(<Umap />);

    const chart = screen.getByTestId("scatter-chart");
    expect(chart).toBeTruthy();
    expect(chart.getAttribute("data-count")).toBe("1");
  });
});

describe("UmapTooltip", () => {
  beforeEach(mockMatchMedia);
  afterEach(cleanup);

  test("renders linked title and formatted date", () => {
    renderWithMantine(
      <UmapTooltip
        payload={[
          {
            payload: {
              title: "Post A",
              href: "/blog/2024/a",
              date: "2024-01-15",
            },
          },
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: "Post A" });
    expect(link.getAttribute("href")).toBe("/blog/2024/a");
    expect(screen.getByText("2024-01-15")).toBeTruthy();
  });

  test("returns null when payload is missing", () => {
    renderWithMantine(<UmapTooltip payload={undefined} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
