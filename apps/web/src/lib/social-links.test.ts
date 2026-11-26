import { describe, expect, it, vi } from "vitest";

const mockGetMenu = vi.fn();
vi.mock("emdash", () => ({ getMenu: (...a: unknown[]) => mockGetMenu(...a) }));

import { fallbackSocialLinks, getSocialLinks, normalizeSocialLinks } from "./social-links";

describe("social links", () => {
  it("normalizes menu items and drops unsafe or incomplete rows", () => {
    const links = normalizeSocialLinks({
      items: [
        { label: "GitHub", url: "https://github.com/x", cssClasses: " GitHub " },
        { label: "Bad", url: "javascript:alert(1)", cssClasses: "x" },
        { label: "", url: "https://a.b", cssClasses: "x" },
        { label: "NoIcon", url: "https://a.b" },
      ],
    });
    expect(links).toEqual([
      { label: "GitHub", url: "https://github.com/x", icon: "github" },
      { label: "NoIcon", url: "https://a.b", icon: "" },
    ]);
  });

  it("falls back to the seed list when the menu is missing or throws", async () => {
    mockGetMenu.mockResolvedValueOnce(null);
    expect(await getSocialLinks()).toEqual(fallbackSocialLinks());
    mockGetMenu.mockRejectedValueOnce(new Error("no db"));
    expect(await getSocialLinks()).toEqual(fallbackSocialLinks());
  });

  it("uses the menu when it has rows", async () => {
    mockGetMenu.mockResolvedValueOnce({ items: [{ label: "A", url: "https://a.b", cssClasses: "x" }] });
    expect(await getSocialLinks()).toEqual([{ label: "A", url: "https://a.b", icon: "x" }]);
  });

  it("fallback has no tracking params and is sorted", () => {
    const f = fallbackSocialLinks();
    expect(f.length).toBe(14);
    expect(f.every((l) => !/[?&](xsec|share_id|apptime|utm_|ref=)/.test(l.url))).toBe(true);
    expect(f[0].icon).toBe("mail");
  });
});
