import { beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/src/analytics", () => ({ track }));

import { trackRelatedClick } from "./related-tracking";

const relates = [
  { id: "tech/a", href: "/tech/a" },
  { id: "tech/b", href: "/tech/b" },
];
const target = (href: string | null) =>
  ({
    closest: () => (href === null ? null : { getAttribute: () => href }),
  }) as unknown as EventTarget;

describe("related_post_clicked", () => {
  beforeEach(() => track.mockClear());

  it("fires with from/to slug and 1-based rank", () => {
    trackRelatedClick(target("/tech/b"), "tech/x", relates);
    expect(track).toHaveBeenCalledWith("related_post_clicked", {
      from_slug: "tech/x",
      to_slug: "tech/b",
      rank: 2,
    });
  });

  it("ignores clicks outside links or on unknown hrefs", () => {
    trackRelatedClick(target(null), "tech/x", relates);
    trackRelatedClick(target("/other"), "tech/x", relates);
    expect(track).not.toHaveBeenCalled();
  });
});
