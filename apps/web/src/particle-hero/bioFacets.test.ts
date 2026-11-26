import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { BIO_FACETS, getBioFacet } from "./bioFacets";
import { CATEGORY_COLORS } from "./postsData";
import { BioCardDeck, BioPersonaChips } from "./components/BioFacetVariations";

const legacyUrlsPath = fileURLToPath(new URL("../../tests/legacy-urls.txt", import.meta.url));
const legacyUrls = new Set(
  readFileSync(legacyUrlsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/")),
);

describe("GON-207 bioFacets dataset", () => {
  test("defines 8 unique facets with valid canvas categories", () => {
    expect(BIO_FACETS).toHaveLength(8);
    const ids = new Set(BIO_FACETS.map((f) => f.id));
    expect(ids.size).toBe(8);

    for (const facet of BIO_FACETS) {
      expect(facet.canvasCategory === "all" || facet.canvasCategory in CATEGORY_COLORS).toBe(true);
      expect(getBioFacet(facet.id)).toBe(facet);
      expect(facet.links.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("every curated facet link exists in legacy-urls.txt", () => {
    for (const facet of BIO_FACETS) {
      for (const link of facet.links) {
        expect(legacyUrls.has(link.href), `${facet.id} -> ${link.href}`).toBe(true);
      }
    }
  });
});

describe("GON-207 low-fi prototype components", () => {
  const fallback = createElement("p", null, "GrowGen fallback SSR bio");

  test("BioPersonaChips server-renders overview fallback and all 8 facet chips", () => {
    const html = renderToStaticMarkup(
      createElement(BioPersonaChips, { fallbackDescription: fallback }),
    );
    const decoded = html.replace(/&amp;/g, "&");
    expect(decoded).toContain("GrowGen fallback SSR bio");
    expect(decoded).toContain("Overview");
    for (const facet of BIO_FACETS) {
      expect(decoded).toContain(facet.label);
      expect(decoded).toContain(`value="${facet.id}"`);
    }
  });

  test("BioPersonaChips renders selected facet story and links", () => {
    const builder = getBioFacet("builder")!;
    const html = renderToStaticMarkup(
      createElement(BioPersonaChips, {
        fallbackDescription: fallback,
        initialFacetId: "builder",
      }),
    );
    const decoded = html.replace(/&amp;/g, "&");
    expect(decoded).toContain(builder.headline);
    expect(decoded).toContain("1/8 explored");
    for (const link of builder.links) {
      expect(decoded).toContain(`href="${link.href}"`);
    }
  });

  test("BioCardDeck server-renders overview fallback and active card controls", () => {
    const overviewHtml = renderToStaticMarkup(
      createElement(BioCardDeck, { fallbackDescription: fallback }),
    );
    expect(overviewHtml).toContain("GrowGen fallback SSR bio");
    expect(overviewHtml).toContain("Deal cards");
    expect(overviewHtml).toContain("Shuffle");

    const games = getBioFacet("games")!;
    const activeHtml = renderToStaticMarkup(
      createElement(BioCardDeck, {
        fallbackDescription: fallback,
        initialFacetId: "games",
      }),
    );
    expect(activeHtml).toContain(games.headline);
    expect(activeHtml).toContain("Card 2 of 8");
    expect(activeHtml).toContain("1/8 unlocked");
  });
});
