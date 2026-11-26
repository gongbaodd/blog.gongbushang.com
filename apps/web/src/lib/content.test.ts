import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentEntry, TaxonomyTerm } from "emdash";

const mockGetEmDashCollection = vi.fn();
const mockGetEmDashEntry = vi.fn();

const mockSeoRows = vi.fn();
vi.mock("emdash/runtime", () => ({
  getDb: async () => ({
    selectFrom: () => ({ select: () => ({ where: () => ({ execute: () => mockSeoRows() }) }) }),
  }),
}));

vi.mock("emdash", () => ({
  getEmDashCollection: (...args: unknown[]) => mockGetEmDashCollection(...args),
  getEmDashEntry: (...args: unknown[]) => mockGetEmDashEntry(...args),
}));

import {
  extractCities,
  extractCover,
  extractSeries,
  extractTags,
  getAllGallery,
  getAllPages,
  getAllPodcasts,
  getAllPosts,
  getPostBySlug,
  mapGallery,
  mapPage,
  mapPodcast,
  mapPost,
  parseColorSet,
  parseFrontmatterExtra,
  parsePostDate,
  postCategory,
  postCities,
  postDate,
  postExcerpt,
  postLinks,
  postSeries,
  postSlug,
  postTags,
  postTitle,
  quickTitle,
  seriesNav,
  type BlogPost,
  type EmDashGalleryData,
  type EmDashPageData,
  type EmDashPodcastData,
  type EmDashPostData,
} from "./content";
import { CANONICAL_COLLECTIONS, renderEnvTypes } from "../../scripts/gen-types.mjs";

function makeTerm(slug: string, label: string): TaxonomyTerm {
  return {
    id: `term-${slug}`,
    name: label,
    slug,
    label,
    children: [],
    locale: "en",
    translationGroup: null,
  };
}

function makeFullPostEntry(
  overrides: Partial<EmDashPostData> = {},
  id = "post-1",
): ContentEntry<EmDashPostData> {
  const now = new Date("2025-02-21T00:00:00Z");
  return {
    id,
    edit: {},
    data: {
      id,
      slug: "puzzle-game",
      status: "published",
      title: "Puzzle Game",
      legacy_id: "2025/02/21/puzzle-game",
      legacy_date: "2025-02-21",
      body_md: "# Puzzle Game\n\nA **fun** game.",
      adsense: true,
      series_number: 2,
      legacy_frontmatter_extra: { type: "post" },
      featured_image: {
        id: "img-1",
        src: "https://res.cloudinary.com/demo/image/upload/v1/cover.jpg",
        alt: "Cover art",
      },
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      terms: {
        category: [makeTerm("fe", "fe")],
        tag: [makeTerm("react", "React"), makeTerm("c#", "C#")],
        series: [makeTerm("games", "Games Series")],
        city: [makeTerm("tallinn-estonia", "Tallinn, Estonia")],
      },
      ...overrides,
    },
  };
}

beforeEach(() => {
  mockGetEmDashCollection.mockReset();
  mockGetEmDashEntry.mockReset();
});

describe("typed field parsers", () => {
  it("parses legacy_frontmatter_extra objects, JSON strings, and invalid values", () => {
    expect(parseFrontmatterExtra({ type: "draft", custom: 1 })).toEqual({
      type: "draft",
      custom: 1,
    });
    expect(parseFrontmatterExtra('{"type":"draft"}')).toEqual({ type: "draft" });
    expect(parseFrontmatterExtra(null)).toEqual({});
    expect(parseFrontmatterExtra(undefined)).toEqual({});
    expect(parseFrontmatterExtra(["draft"])).toEqual({});
    expect(parseFrontmatterExtra("not-json")).toEqual({});
    expect(parseFrontmatterExtra(42)).toEqual({});
  });

  it("parses color_set objects, JSON strings, and rejects malformed values", () => {
    expect(parseColorSet({ bgColor: "#112233", titleColor: "--c-1" })).toEqual({
      bgColor: "#112233",
      titleColor: "--c-1",
    });
    expect(parseColorSet('{"bgColor":"#000","titleColor":"#fff"}')).toEqual({
      bgColor: "#000",
      titleColor: "#fff",
    });
    expect(parseColorSet({ bgColor: "", titleColor: "#fff" })).toBeUndefined();
    expect(parseColorSet({ bgColor: "#000" })).toBeUndefined();
    expect(parseColorSet(null)).toBeUndefined();
    expect(parseColorSet("{bad")).toBeUndefined();
  });

  it("resolves dates from legacy_date or falls back to legacy_id", () => {
    expect(parsePostDate("2025-02-21", "2024/01/01/x")).toBe("2025-02-21");
    expect(parsePostDate(undefined, "2024/01/05/x")).toBe("2024-01-05");
    expect(parsePostDate(null, "2024/01/05/x")).toBe("2024-01-05");
    expect(parsePostDate("2025-13-40", "2024/01/05/x")).toBe("2024-01-05");
    expect(parsePostDate("not-a-date", "2024/01/05/x")).toBe("2024-01-05");

    const d = postDate({ date: "2025-02-21", id: "2025/02/21/x" });
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(21);
  });

  it("extracts post slugs with or without directory prefixes", () => {
    expect(postSlug({ id: "2025/02/21/puzzle-game" })).toBe("puzzle-game");
    expect(postSlug({ id: "standalone" })).toBe("standalone");
  });
});

describe("cover, series, city, and tag extractors", () => {
  it("optimizes Cloudinary cover URLs and handles missing/empty alt or src", () => {
    expect(
      extractCover({
        src: "https://res.cloudinary.com/demo/image/upload/v1/cover.jpg",
        alt: "Photo",
      }),
    ).toEqual({
      url: expect.stringContaining("f_auto,q_auto"),
      alt: "Photo",
    });
    expect(extractCover({ src: "https://example.com/pic.png" })).toEqual({
      url: "https://example.com/pic.png",
      alt: "",
    });
    expect(extractCover({ src: "   " })).toBeUndefined();
    expect(extractCover(null)).toBeUndefined();
    expect(extractCover(undefined)).toBeUndefined();
  });

  it("extracts series with optional name and finite number", () => {
    expect(extractSeries({ series: [{ slug: "linear", label: "线性代数" }] }, 3)).toEqual({
      slug: "linear",
      name: "线性代数",
      number: 3,
    });
    // When label equals slug, name is omitted
    expect(extractSeries({ series: [{ slug: "linear", label: "linear" }] }, 0)).toEqual({
      slug: "linear",
      number: 0,
    });
    // Non-finite numbers are ignored
    expect(extractSeries({ series: [{ slug: "linear", label: "Linear" }] }, Number.NaN)).toEqual({
      slug: "linear",
      name: "Linear",
    });
    expect(extractSeries({ series: [] }, 1)).toBeUndefined();
    expect(extractSeries(null, 1)).toBeUndefined();
  });

  it("extracts tags preserving display casing and resiliently skips empties", () => {
    expect(
      extractTags({
        tag: [
          { slug: "typescript", label: "TypeScript" },
          { slug: "fallback-only", label: "" },
          { slug: "", label: "" },
        ],
      }),
    ).toEqual(["TypeScript", "fallback-only"]);
    expect(extractTags(undefined)).toEqual([]);
  });

  it("extracts cities with fallback label to slug and skips empty slugs", () => {
    expect(
      extractCities({
        city: [
          { slug: "tallinn-estonia", label: "Tallinn, Estonia" },
          { slug: "helsinki", label: "" },
          { slug: "", label: "Ignored" },
        ],
      }),
    ).toEqual([
      { slug: "tallinn-estonia", label: "Tallinn, Estonia" },
      { slug: "helsinki", label: "helsinki" },
    ]);
    expect(extractCities(null)).toEqual([]);
  });
});

describe("mapPost", () => {
  it("maps a full EmDash ContentEntry<Post> with strict types", () => {
    const post = mapPost(makeFullPostEntry())!;
    expect(post).toBeDefined();
    expect(post.id).toBe("2025/02/21/puzzle-game");
    expect(post.entryId).toBe("post-1");
    expect(post.href).toBe("/fe/2025/02/21/puzzle-game/");
    expect(post.date).toBe("2025-02-21");
    expect(post.cmsTitle).toBe("Puzzle Game");
    expect(post.body).toBe("# Puzzle Game\n\nA **fun** game.");
    expect(post.params).toEqual({
      category: "fe",
      year: "2025",
      month: "02",
      day: "21",
      slug: "puzzle-game",
    });
    expect(post.data).toEqual({
      type: "post",
      category: "fe",
      adsense: true,
      tag: ["React", "C#"],
      series: { slug: "games", name: "Games Series", number: 2 },
      cover: {
        url: expect.stringContaining("f_auto,q_auto"),
        alt: "Cover art",
      },
      city: [{ slug: "tallinn-estonia", label: "Tallinn, Estonia" }],
    });
  });

  it("handles draft type, omitted optional fields, and null resilience", () => {
    const post = mapPost({
      id: "draft-1",
      data: {
        legacy_id: "2024/08/01/my-draft",
        legacy_date: undefined,
        body_md: undefined,
        title: undefined,
        adsense: undefined,
        series_number: undefined,
        featured_image: null,
        legacy_frontmatter_extra: { type: "draft" },
        terms: {
          category: [{ slug: "life", label: "life" }],
        },
      },
    })!;
    expect(post.date).toBe("2024-08-01");
    expect(post.body).toBe("");
    expect(post.cmsTitle).toBe("");
    expect(post.data).toEqual({
      type: "draft",
      category: "life",
      adsense: false,
    });
  });

  it("returns undefined for entries without legacy_id and throws on missing category or bad legacy_id", () => {
    expect(mapPost({ id: "x", data: { title: "Starter" } })).toBeUndefined();
    expect(mapPost({ id: "x", data: { legacy_id: "   " } })).toBeUndefined();
    expect(() => mapPost({ id: "x", data: { legacy_id: "2024/01/01/ok", terms: null } })).toThrow(
      /no category term/,
    );
    expect(() =>
      mapPost({
        id: "x",
        data: { legacy_id: "bad-id", terms: { category: [{ slug: "fe", label: "fe" }] } },
      }),
    ).toThrow(/malformed legacy_id/);
  });
});

describe("mapPodcast, mapGallery, mapPage", () => {
  const now = new Date("2025-01-01T00:00:00Z");

  it("maps EmDash podcast entries cleanly and handles missing fields", () => {
    const entry: ContentEntry<EmDashPodcastData> = {
      id: "ep-1",
      edit: {},
      data: {
        id: "ep-1",
        slug: "--e2iv0jd",
        status: "published",
        title: "Episode 1",
        legacy_id: "--e2iv0jd",
        link: "https://podcasters.spotify.com/ep1",
        pub_date: "2025-01-10T00:00:00Z",
        description: "<p>Desc</p>",
        summary: "Sum",
        duration: "00:42:00",
        audio_url: "https://cdn.example/ep1.mp3",
        image_url: "https://cdn.example/ep1.jpg",
        color_set: { bgColor: "#222", titleColor: "#eee" },
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    };
    expect(mapPodcast(entry)).toEqual({
      id: "--e2iv0jd",
      entryId: "ep-1",
      href: "/podcast/--e2iv0jd/",
      title: "Episode 1",
      link: "https://podcasters.spotify.com/ep1",
      pubDate: "2025-01-10T00:00:00Z",
      description: "<p>Desc</p>",
      summary: "Sum",
      duration: "00:42:00",
      audioUrl: "https://cdn.example/ep1.mp3",
      image: "https://cdn.example/ep1.jpg",
      colorSet: { bgColor: "#222", titleColor: "#eee" },
    });

    expect(mapPodcast({ id: "   ", data: {} })).toBeUndefined();
    expect(mapPodcast({ id: "ep-minimal", data: { color_set: "invalid" } })).toEqual({
      id: "ep-minimal",
      entryId: "ep-minimal",
      href: "/podcast/ep-minimal/",
      title: "",
      link: "",
      pubDate: "",
    });
  });

  it("maps EmDash gallery entries, optimizes Cloudinary URLs, and skips incomplete rows", () => {
    const entry: ContentEntry<EmDashGalleryData> = {
      id: "gal-1",
      edit: {},
      data: {
        id: "gal-1",
        slug: "08-26-jinghong",
        status: "published",
        title: "Jinghong",
        legacy_id: "08/26/jinghong",
        file: "08/26/jinghong.jpg",
        hash: "abc123",
        image_url: "https://res.cloudinary.com/demo/image/upload/v1/jh.jpg",
        doc: "/2020/08/26/jinghong",
        added_at: "2025-01-02T00:00:00Z",
        color_set: { bgColor: "#333", titleColor: "#fff" },
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    };
    const mapped = mapGallery(entry)!;
    expect(mapped).toEqual({
      id: "08/26/jinghong",
      entryId: "gal-1",
      title: "Jinghong",
      file: "08/26/jinghong.jpg",
      hash: "abc123",
      image: expect.stringContaining("f_auto,q_auto"),
      doc: "/2020/08/26/jinghong",
      addedAt: "2025-01-02T00:00:00Z",
      colorSet: { bgColor: "#333", titleColor: "#fff" },
    });

    expect(mapGallery({ id: "bad", data: { legacy_id: "08/26/x" } })).toBeUndefined();
    expect(mapGallery({ id: "bad", data: { image_url: "https://a.com/x.jpg" } })).toBeUndefined();
  });

  it("maps EmDash page entries", () => {
    const entry: ContentEntry<EmDashPageData> = {
      id: "about",
      edit: {},
      data: {
        id: "about",
        slug: "about",
        status: "published",
        title: "About",
        content: [{ _type: "block", _key: "k0" }],
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    };
    expect(mapPage(entry)).toEqual({
      id: "about",
      entryId: "about",
      slug: "about",
      title: "About",
      content: [{ _type: "block", _key: "k0" }],
    });
    expect(mapPage({ id: "empty", data: {} })).toEqual({
      id: "empty",
      entryId: "empty",
      slug: null,
      title: "",
      content: [],
    });
  });
});

describe("title, excerpt, taxonomy links, and seriesNav", () => {
  const post = mapPost(makeFullPostEntry())!;

  it("resolves title via headings -> cmsTitle -> slug", () => {
    expect(postTitle(post, [{ text: "Heading 1" }])).toBe("Heading 1");
    expect(postTitle(post, [])).toBe("Puzzle Game");
    expect(postTitle({ id: "2025/02/21/my-slug", cmsTitle: "" }, [])).toBe("my slug");
  });

  it("quickTitle ignores headings inside backtick or tilde fences", () => {
    expect(
      quickTitle({
        id: "2025/01/01/a",
        cmsTitle: "Fallback",
        body: "```md\n# Inside fence\n```\n~~~\n## Inside tilde\n~~~\n### Real Title ###\n",
      }),
    ).toBe("Real Title");
    expect(
      quickTitle({
        id: "2025/01/01/a-b",
        cmsTitle: "",
        body: "No headings here",
      }),
    ).toBe("a b");
  });

  it("generates stripped markdown excerpts and handles empty bodies", async () => {
    expect(await postExcerpt("")).toBe("");
    // whitespace-only body (frontmatter-only legacy post): no description meta (legacy emits an empty one)
    expect(await postExcerpt("\n")).toBe("");
    expect(await postExcerpt("  \n\n ")).toBe("");
    // non-empty body that strips to nothing keeps legacy's bare "..." (30-ish posts, e.g. image-only)
    expect(await postExcerpt("# Only a title\n")).toBe("...");
    const ex = await postExcerpt("# Heading\n\nHello **world** from [EmDash](https://x.test).", 20);
    expect(ex.endsWith("...")).toBe(true);
    expect(ex).toContain("Hello world");
    expect(ex).not.toContain("**");
  });

  it("builds legacy-compatible category, tag, series, city, and combined postLinks", () => {
    expect(postCategory(post)).toEqual({ label: "fe", href: "/fe" });
    expect(postTags(post)).toEqual([
      { label: "React", href: "/tag/react" },
      { label: "C#", href: "/tag/c%23" },
    ]);
    expect(postSeries(post)).toEqual({ label: "Games Series", href: "/series/games" });
    expect(postCities(post)).toEqual([
      { label: "Tallinn, Estonia", href: "/world/tallinn-estonia" },
    ]);
    expect(postLinks(post)).toEqual([
      { label: "fe", href: "/fe" },
      { label: "React", href: "/tag/react" },
      { label: "C#", href: "/tag/c%23" },
      { label: "Games Series", href: "/series/games" },
      { label: "Tallinn, Estonia", href: "/world/tallinn-estonia" },
    ]);
  });

  it("computes seriesNav ordered by series_number then date then id", () => {
    const mk = (id: string, date: string, number?: number, seriesSlug = "s"): BlogPost =>
      mapPost({
        id,
        data: {
          legacy_id: id,
          legacy_date: date,
          title: id,
          series_number: number,
          terms: {
            category: [{ slug: "fe", label: "fe" }],
            series: seriesSlug ? [{ slug: seriesSlug, label: "My Series" }] : [],
          },
        },
      })!;

    const p1 = mk("2024/01/01/one", "2024-01-01", 1);
    const p2 = mk("2024/02/01/two", "2024-02-01", 2);
    const p3 = mk("2024/03/01/three", "2024-03-01", undefined);
    const other = mk("2024/04/01/other", "2024-04-01", 1, "");

    expect(seriesNav(other, [p1, p2, p3, other], (p) => p.cmsTitle)).toBeUndefined();

    const nav2 = seriesNav(p2, [p3, p1, p2, other], (p) => p.cmsTitle);
    expect(nav2).toEqual({
      slug: "s",
      name: "My Series",
      href: "/series/s",
      number: 2,
      total: 3,
      prev: { title: "2024/01/01/one", href: "/fe/2024/01/01/one/" },
      next: { title: "2024/03/01/three", href: "/fe/2024/03/01/three/" },
    });

    const nav1 = seriesNav(p1, [p1, p2], (p) => p.cmsTitle);
    expect(nav1?.prev).toBeUndefined();
    expect(nav1?.next?.href).toBe("/fe/2024/02/01/two/");
  });
});

describe("paginated EmDash collection fetchers", () => {
  it("paginates getAllPosts across cursors and skips non-legacy entries", async () => {
    mockSeoRows.mockResolvedValue([]);
    mockGetEmDashCollection
      .mockResolvedValueOnce({
        entries: [
          makeFullPostEntry({ legacy_id: "2025/01/01/a" }, "a"),
          makeFullPostEntry({ legacy_id: undefined }, "starter-welcome"),
        ],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        entries: [makeFullPostEntry({ legacy_id: "2025/01/02/b" }, "b")],
        nextCursor: undefined,
      });

    const posts = await getAllPosts();
    expect(posts.map((p) => p.id)).toEqual(["2025/01/01/a", "2025/01/02/b"]);
    expect(mockGetEmDashCollection).toHaveBeenCalledTimes(2);
    expect(mockGetEmDashCollection).toHaveBeenNthCalledWith(1, "posts", {
      limit: 100,
      cursor: undefined,
    });
    expect(mockGetEmDashCollection).toHaveBeenNthCalledWith(2, "posts", {
      limit: 100,
      cursor: "cursor-2",
    });
  });

  it("attaches SEO-panel rows (one batched query) keyed by the database ULID, not the slug (GON-203)", async () => {
    mockSeoRows.mockReset();
    mockSeoRows.mockResolvedValue([
      { content_id: "01ULIDA", seo_title: "T", seo_description: null, seo_image: null, seo_canonical: null, seo_no_index: 1 },
    ]);
    mockGetEmDashCollection.mockResolvedValueOnce({
      entries: [
        makeFullPostEntry({ legacy_id: "2025/01/01/a", id: "01ULIDA" } as never, "a"),
        makeFullPostEntry({ legacy_id: "2025/01/02/b", id: "01ULIDB" } as never, "b"),
      ],
    });
    // module-level memo: a fresh import so this test's rows are read
    vi.resetModules();
    const { getAllPosts: fresh } = await import("./content");
    const posts = await fresh();
    expect(posts[0]).toMatchObject({ entryId: "a", dbId: "01ULIDA", seo: { title: "T", noIndex: true } });
    expect(posts[1]!.dbId).toBe("01ULIDB");
    expect(posts[1]!.seo).toBeUndefined();
    expect(mockSeoRows).toHaveBeenCalledTimes(1);
  });

  it("propagates EmDash errors from collection and single-entry queries", async () => {
    mockGetEmDashCollection.mockResolvedValueOnce({
      entries: [],
      error: new Error("db unreachable"),
    });
    await expect(getAllPosts()).rejects.toThrow("db unreachable");

    mockGetEmDashEntry.mockResolvedValueOnce({
      entry: null,
      error: new Error("lookup failed"),
    });
    await expect(getPostBySlug("missing")).rejects.toThrow("lookup failed");
  });

  it("fetches single post by slug and returns undefined when missing", async () => {
    mockGetEmDashEntry
      .mockResolvedValueOnce({ entry: makeFullPostEntry({}, "p-slug") })
      .mockResolvedValueOnce({ entry: null });

    const found = await getPostBySlug("p-slug");
    expect(found?.id).toBe("2025/02/21/puzzle-game");
    expect(await getPostBySlug("nope")).toBeUndefined();
  });

  it("fetches podcasts, gallery, and pages collections", async () => {
    mockGetEmDashCollection
      .mockResolvedValueOnce({
        entries: [{ id: "ep1", edit: {}, data: { legacy_id: "ep1", title: "Ep 1" } }],
      })
      .mockResolvedValueOnce({
        entries: [
          {
            id: "g1",
            edit: {},
            data: { legacy_id: "01/01/pic", image_url: "https://example.com/a.jpg", title: "Pic" },
          },
        ],
      })
      .mockResolvedValueOnce({
        entries: [{ id: "about", edit: {}, data: { slug: "about", title: "About", content: [] } }],
      });

    expect((await getAllPodcasts()).map((p) => p.id)).toEqual(["ep1"]);
    expect((await getAllGallery()).map((g) => g.id)).toEqual(["01/01/pic"]);
    expect((await getAllPages()).map((p) => p.slug)).toEqual(["about"]);
  });
});

describe("gen-types canonical schema parity", () => {
  it("renders emdash-env.d.ts byte-identically to the committed file", () => {
    const committed = readFileSync(new URL("../../emdash-env.d.ts", import.meta.url), "utf8");
    expect(renderEnvTypes(CANONICAL_COLLECTIONS)).toBe(committed);
  });
});
