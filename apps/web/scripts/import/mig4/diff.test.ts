import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRewriteLookup,
  diffPostDom,
  extractPostDom,
  expectedNewUrl,
  filterPostUrls,
  findNewPosts,
  hiddenH1Selectors,
  levenshteinDistance,
  optimizeCloudinaryUrl,
  runBulkDiff,
  runBulkDiffIsolated,
} from "./lib.mjs";
import { optimizeCloudinaryUrl as siteOptimizeCloudinaryUrl } from "../../../src/lib/cloudinary";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(HERE, "diff.mjs");

function renderHtml({
  title = "Test Post",
  description = "Post summary",
  canonical = "https://growgen.xyz/fe/2025/01/02/sample/",
  siteH1 = "GrowGen",
  body = "<h2 id='intro'>Intro</h2><p>Hello world.</p>",
  wrapInProseContent = true,
} = {}) {
  const inner = wrapInProseContent
    ? `<div class="prose sidebar-nav">Sidebar</div><div class="prose lg:prose-xl _content_abc">${body}</div>`
    : `<article>${body}</article>`;
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonical}" />
  </head>
  <body>
    <header><h1> ${siteH1} </h1></header>
    <main>${inner}</main>
  </body>
</html>`;
}

describe("MIG-4 lib: extractPostDom", () => {
  it("extracts metadata, headings, links, images, element counts, and normalized text", () => {
    const html = renderHtml({
      title: "  GrowGen | Sample   Post ",
      description: "  A   rich post  ",
      canonical: "https://growgen.xyz/fe/2025/01/02/sample/",
      body: `
        <h1 id="post-title">Sample   Title</h1>
        <h2 id="sec-1">Section 1</h2>
        <p>Hello   <strong>world</strong>! See <a href="/tag/c#">C#</a> and <a href="https://example.com">Ex</a>.</p>
        <img src="/_astro/photo.AbCdEf12_Z1a2b3.webp" alt="photo" />
        <span class="katex">x^2</span>
        <span class="katex">y^2</span>
        <pre class="mermaid">graph TD; A-->B;</pre>
        <pre class="astro-code"><code>const x = 1;</code></pre>
        <pre data-language="plantuml">@startuml\n@enduml</pre>
        <iframe src="https://example.com/embed"></iframe>
        <table><tr><td>cell</td></tr></table>
      `,
    });

    const dom = extractPostDom(html);
    expect(dom.title).toBe("GrowGen | Sample Post");
    expect(dom.h1).toBe("GrowGen");
    expect(dom.description).toBe("A rich post");
    expect(dom.canonical).toBe("https://growgen.xyz/fe/2025/01/02/sample/");
    expect(dom.headings).toEqual(["H1#post-title:Sample Title", "H2#sec-1:Section 1"]);
    expect(dom.links).toEqual(["/tag/c#", "https://example.com"]);
    expect(dom.images).toEqual(["/_astro/photo.AbCdEf12_Z1a2b3.webp"]);
    expect(dom.counts).toEqual({
      katex: 2,
      mermaid: 1,
      code: 1,
      plantuml: 1,
      iframe: 1,
      table: 1,
    });
    expect(dom.text).toContain("Sample Title Section 1 Hello world!");
    expect(dom.text).not.toContain("Sidebar");
  });

  it("falls back to <article> when no prose content container exists", () => {
    const html = renderHtml({
      wrapInProseContent: false,
      body: `<h2 id="a">Alpha</h2>\n<p>Fallback text</p>`,
    });
    const dom = extractPostDom(html);
    expect(dom.headings).toEqual(["H2#a:Alpha"]);
    expect(dom.text).toBe("Alpha Fallback text");
  });
});

describe("MIG-4 lib: expectedNewUrl (one-sided: legacy URL -> what the new site must emit)", () => {
  const rewriteMap = {
    deliveryBase: "https://res.cloudinary.com/dmq8ipket/image/upload/",
    posts: {
      "2015/08/18/B.md": {
        "./89d0a2e1gw1evcern5sufj21kw16rnkw.jpg":
          "https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/2015/08/18/b/73c11c4c5944",
      },
      "2016/03/31/VUE-Riot-React.md": {
        "http://ww1.sinaimg.cn/large/89d0a2e1gw1f2u8fh7uygj20tv0n4473.jpg":
          "https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/2016/03/31/vue-riot-react/21606f5a8988",
      },
    },
  };
  const cld =
    "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2016/03/31/vue-riot-react/21606f5a8988";

  it("maps legacy external and Astro-hashed local images through the rewrite map and adds f_auto,q_auto", () => {
    const external = expectedNewUrl("http://ww1.sinaimg.cn/large/89d0a2e1gw1f2u8fh7uygj20tv0n4473.jpg", {
      kind: "image",
      rewriteMap,
      postPath: "/fe/2016/03/31/vue-riot-react/",
    });
    expect(external.url).toBe(cld);
    expect(external.reasons).toEqual(["rewrite-map", "cloudinary-auto"]);

    const local = expectedNewUrl("/_astro/89d0a2e1gw1evcern5sufj21kw16rnkw.CMylg40p_Z1gK9dp.webp", {
      kind: "image",
      rewriteMap,
      postPath: "/life/2015/08/18/b/",
    });
    expect(local.url).toBe(
      "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2015/08/18/b/73c11c4c5944",
    );
  });

  it("maps legacy origin to the expected new origin and /tag/c# to /tag/c%23", () => {
    const opts = { legacyOrigin: "https://growgen.xyz", newOrigin: "https://next.growgen.xyz" };
    expect(expectedNewUrl("https://growgen.xyz/book/2020/01/01/post/", opts).url).toBe(
      "https://next.growgen.xyz/book/2020/01/01/post/",
    );
    expect(expectedNewUrl("https://growgen.xyz.evil.example/x", opts).url).toBe("https://growgen.xyz.evil.example/x");
    expect(expectedNewUrl("/tag/c#").url).toBe("/tag/c%23");
    expect(expectedNewUrl("/tag/c#", {}).reasons).toEqual(["tag-hash"]);
    expect(expectedNewUrl("/about/#top").url).toBe("/about/#top");
  });

  it("only rehosted images gain f_auto,q_auto; the helper matches the site's optimizeCloudinaryUrl", () => {
    const raw = "https://res.cloudinary.com/dmq8ipket/image/upload/v123/pic.jpg";
    // legacy-emitted Cloudinary URLs stay exactly as legacy had them (only rehosted images gain the transform)
    expect(expectedNewUrl(raw, { kind: "image" }).url).toBe(raw);
    expect(expectedNewUrl(raw, { kind: "link" }).url).toBe(raw);
    for (const u of [
      raw,
      "https://res.cloudinary.com/dmq8ipket/image/upload/w_800/v123/pic.jpg?x=1",
      "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/v123/pic.jpg",
      "https://res.cloudinary.com/dmq8ipket/video/upload/v9/a.mp4",
      "https://example.com/a.png",
    ]) {
      expect(optimizeCloudinaryUrl(u)).toBe(siteOptimizeCloudinaryUrl(u));
    }
  });
});

describe("MIG-4 lib: one-sided URL comparison catches regressions (exact equality)", () => {
  const legacyBody = `<h2 id="s">S</h2><a href="/tag/c#">C#</a><img src="http://ww1.sinaimg.cn/large/a.jpg" />`;
  const legacy = extractPostDom(renderHtml({ body: legacyBody }));
  const rewriteMap = {
    "http://ww1.sinaimg.cn/large/a.jpg": "https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/a",
  };
  const goodNew = extractPostDom(
    renderHtml({
      body: `<h2 id="s">S</h2><a href="/tag/c%23">C#</a><img src="https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/a" />`,
    }),
  );

  it("passes when the new page emits exactly the mapped URLs", () => {
    const diff = diffPostDom(legacy, goodNew, { rewriteMap });
    expect(diff.severity).toBe("expected");
    expect(diff.expectedReasons.sort()).toEqual(["cloudinary-auto", "rewrite-map", "tag-hash"]);
  });

  it("flags a broken /tag/c# link in the NEW page", () => {
    const bad = structuredClone(goodNew);
    bad.links = ["/tag/c#"];
    const diff = diffPostDom(legacy, bad, { rewriteMap });
    expect(diff.flaggedFields).toContain("links");
    expect(diff.fields.links.extra).toEqual(["/tag/c#"]);
  });

  it("flags dropped f_auto,q_auto as an image error", () => {
    const bad = structuredClone(goodNew);
    bad.images = ["https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/a"];
    const diff = diffPostDom(legacy, bad, { rewriteMap });
    expect(diff.severity).toBe("error");
    expect(diff.fields.images.status).toBe("flagged-diff");
  });

  it("flags a leaked preview origin and an unrewritten relative image", () => {
    const leaked = structuredClone(goodNew);
    leaked.canonical = "https://next.growgen.xyz/fe/2025/01/02/sample/";
    expect(diffPostDom(legacy, leaked, { rewriteMap }).flaggedFields).toContain("canonical");
    const rel = structuredClone(goodNew);
    rel.images = ["../17/2020-07-17.jpg"];
    expect(diffPostDom(legacy, rel, { rewriteMap }).severity).toBe("error");
  });
});

describe("MIG-4 lib: headings and visible h1 (PORT-9 duplicate-h1 class)", () => {
  const css = "<style>._content_x>h1{display:none}._other{color:red}</style>";
  const page = (inner: string) =>
    renderHtml({ wrapInProseContent: false, body: "" }).replace(
      "<main><article></article></main>",
      `${css}<main><div class="prose lg:prose-xl _content_x">${inner}</div></main>`,
    );
  const legacyHtml = page(`<h1 id="t">Post Title</h1><h2 id="a">A</h2><p>Body text goes here.</p>`);

  it("counts the content h1 as hidden when `.content > h1 {display:none}` matches it", () => {
    const dom = extractPostDom(legacyHtml);
    // only the header h1 (GrowGen) is visible
    expect(dom.visibleH1).toBe(1);
    expect(dom.visibleH1Texts).toEqual(["GrowGen"]);
  });

  it("MUTATION: wrapping the content h1 in <astro-slot> makes it visible -> error", () => {
    const mutated = page(`<astro-slot><h1 id="t">Post Title</h1></astro-slot><h2 id="a">A</h2><p>Body text goes here.</p>`);
    const legacyDom = extractPostDom(legacyHtml);
    const newDom = extractPostDom(mutated);
    expect(newDom.visibleH1).toBe(2);
    expect(legacyDom.visibleContentH1).toBe(0);
    expect(newDom.visibleContentH1).toBe(1);
    const diff = diffPostDom(legacyDom, newDom);
    expect(diff.severity).toBe("error");
    expect(diff.errorReasons).toContain("extra-visible-h1");
    expect(diff.fields.visibleContentH1).toMatchObject({ status: "flagged-diff", legacy: 0, new: 1 });
    // headings are identical (the wrapper does not change them), so only the visibility check can catch it
    expect(diff.fields.headings.status).toBe("match");
  });

  it("a page-wide visible-h1 difference outside the content root (cards, widgets) is only a warning", () => {
    const base = extractPostDom(legacyHtml);
    const other = structuredClone(base);
    other.visibleH1 = base.visibleH1 - 1;
    const diff = diffPostDom(base, other);
    expect(diff.severity).toBe("warn");
    expect(diff.flaggedFields).toEqual(["visibleH1"]);
  });

  it("an extra heading (esp. h1) is an error, an extra h2 too", () => {
    const base = extractPostDom(legacyHtml);
    const extraH1 = structuredClone(base);
    extraH1.headings = [...base.headings, "H1#dup:Post Title"];
    let diff = diffPostDom(base, extraH1);
    expect(diff.severity).toBe("error");
    expect(diff.errorReasons).toContain("extra-h1");

    const extraH2 = structuredClone(base);
    extraH2.headings = [...base.headings, "H2#more:More"];
    diff = diffPostDom(base, extraH2);
    expect(diff.severity).toBe("error");
    expect(diff.errorReasons).toContain("extra-heading");
  });

  it("reads hide rules from linked stylesheets under distDir", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig4-css-"));
    try {
      mkdirSync(join(dir, "_astro"));
      writeFileSync(join(dir, "_astro", "a.css"), "._content_x>h1{display:none}");
      const html = renderHtml({ wrapInProseContent: false, body: "" }).replace(
        "</head>",
        '<link rel="stylesheet" href="/_astro/a.css"></head>',
      ).replace("<main><article></article></main>", '<main><div class="prose _content_x"><h1>T</h1></div></main>');
      expect(extractPostDom(html, { distDir: dir }).visibleH1).toBe(1);
      expect(extractPostDom(html).visibleH1).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hiddenH1Selectors keeps only display:none rules that mention h1", () => {
    expect(hiddenH1Selectors("._c>h1{display:none}.a{display:none}h1,h2{color:red}.m h1, .n>h1{display: none}")).toEqual([
      "._c>h1",
      ".m h1",
      ".n>h1",
    ]);
  });
});

describe("MIG-4 lib: text excludes style/script/template; content-root fallbacks", () => {
  it("never counts style, script or template content", () => {
    const html = renderHtml({
      body: `<p>Visible</p><style>.x{color:red}</style><script>var leaked = 1;</script><template><p>tpl text</p></template>`,
    });
    const dom = extractPostDom(html);
    expect(dom.text).toBe("Visible");
  });

  it("treats a whitespace-only text difference between block elements as expected, not drift", () => {
    const legacy = extractPostDom(renderHtml({ body: "<p>one</p><p>two</p>" }));
    const next = extractPostDom(renderHtml({ body: "<p>one</p>\n<p>two</p>" }));
    const diff = diffPostDom(legacy, next);
    expect(diff.fields.text).toMatchObject({ status: "expected-diff", reasons: ["whitespace-only"] });
    expect(diff.severity).toBe("expected");
    expect(diff.expectedReasons).toEqual(["whitespace-only"]);
  });

  it("reports which content root was used", () => {
    expect(extractPostDom(renderHtml()).contentRoot).toBe("prose");
    expect(extractPostDom(renderHtml({ wrapInProseContent: false })).contentRoot).toBe("article");
    expect(extractPostDom("<html><body><p>x</p></body></html>").contentRoot).toBe("body");
  });
});

describe("MIG-4 lib: diffPostDom", () => {
  const baseDom = extractPostDom(
    renderHtml({
      body: `
        <h2 id="s1">Section One</h2>
        <p>This is a sufficiently long body paragraph for parity testing across legacy and new builds.</p>
        <a href="/tag/rust">Rust</a>
        <img src="http://ww1.sinaimg.cn/large/abc.jpg" />
        <pre class="astro-code"><code>console.log(1)</code></pre>
      `,
    }),
  );

  it("returns ok when DOMs are identical", () => {
    const diff = diffPostDom(baseDom, structuredClone(baseDom));
    expect(diff.severity).toBe("ok");
    expect(diff.flaggedFields).toEqual([]);
    expect(diff.expectedFields).toEqual([]);
  });

  it("classifies mapped Cloudinary rehost, origin change, and /tag/c# encoding as expected", () => {
    const newDom = extractPostDom(
      renderHtml({
        canonical: "https://next.growgen.xyz/fe/2025/01/02/sample/",
        body: `
          <h2 id="s1">Section One</h2>
          <p>This is a sufficiently long body paragraph for parity testing across legacy and new builds.</p>
          <a href="/tag/c%23">Rust</a>
          <img src="https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/abc" />
          <pre class="astro-code"><code>console.log(1)</code></pre>
        `,
      }),
    );

    const legacyWithTag = structuredClone(baseDom);
    legacyWithTag.links = ["/tag/c#"];
    const diff = diffPostDom(legacyWithTag, newDom, {
      newOrigin: "https://next.growgen.xyz",
      rewriteMap: {
        "http://ww1.sinaimg.cn/large/abc.jpg":
          "https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/abc",
      },
    });
    expect(diff.severity).toBe("expected");
    expect(diff.flaggedFields).toEqual([]);
    expect(diff.expectedFields).toEqual(["canonical", "links", "images"]);
    expect(diff.fields.images.status).toBe("expected-diff");
  });

  it("flags missing heading as error", () => {
    const newDom = structuredClone(baseDom);
    newDom.headings = [];
    const diff = diffPostDom(baseDom, newDom);
    expect(diff.severity).toBe("error");
    expect(diff.fields.headings.status).toBe("flagged-diff");
    expect(diff.fields.headings.missing).toEqual(["H2#s1:Section One"]);
  });

  it("flags missing/broken image as error", () => {
    const newDom = structuredClone(baseDom);
    newDom.images = [];
    const diff = diffPostDom(baseDom, newDom);
    expect(diff.severity).toBe("error");
    expect(diff.fields.images.status).toBe("flagged-diff");
    expect(diff.fields.images.missing).toEqual(["http://ww1.sinaimg.cn/large/abc.jpg"]);
  });

  it("flags minor text drift as warn with snippet and Levenshtein distance, and large drop as error", () => {
    const minorDom = structuredClone(baseDom);
    minorDom.text = baseDom.text.replace("builds.", "builds!");
    const minorDiff = diffPostDom(baseDom, minorDom);
    expect(minorDiff.severity).toBe("warn");
    expect(minorDiff.fields.text.status).toBe("flagged-diff");
    expect(minorDiff.fields.text.editDistance).toBe(1);
    expect(minorDiff.fields.text.lengthDelta).toBe(0);
    expect(minorDiff.fields.text.legacySnippet).toContain("builds.");
    expect(minorDiff.fields.text.newSnippet).toContain("builds!");

    const droppedDom = structuredClone(baseDom);
    droppedDom.text = "Section One";
    const dropDiff = diffPostDom(baseDom, droppedDom);
    expect(dropDiff.severity).toBe("error");
    expect(dropDiff.fields.text.lengthDelta).toBeLessThan(-50);
  });

  it("flags dropped element counts as error and extra counts as warn", () => {
    const droppedCounts = structuredClone(baseDom);
    droppedCounts.counts.code = 0;
    const errDiff = diffPostDom(baseDom, droppedCounts);
    expect(errDiff.severity).toBe("error");
    expect(errDiff.fields.counts).toMatchObject({
      status: "flagged-diff",
      hasDrop: true,
      mismatches: { code: { legacy: 1, new: 0 } },
    });

    const extraCounts = structuredClone(baseDom);
    extraCounts.counts.code = 2;
    const warnDiff = diffPostDom(baseDom, extraCounts);
    expect(warnDiff.severity).toBe("warn");
    expect(warnDiff.fields.counts).toMatchObject({
      status: "flagged-diff",
      hasDrop: false,
      mismatches: { code: { legacy: 1, new: 2 } },
    });
  });

  it("computes exact Levenshtein distance", () => {
    expect(levenshteinDistance("kitten", "sitting")).toEqual({ distance: 3, approx: false });
    expect(levenshteinDistance("same", "same")).toEqual({ distance: 0, approx: false });
  });
});

describe("MIG-4 CLI & fixture end-to-end comparison", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function writePost(root: string, urlPath: string, html: string) {
    const dir = join(root, ...urlPath.replace(/^\/|\/$/g, "").split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html, "utf8");
  }

  it("filters post URLs accurately", () => {
    const raw = [
      "# comment",
      "/",
      "/about/",
      "/api/all/0.ndjson",
      "/book/2017/01/22/ming/",
      "/life/2015/08/18/b/",
      "/life/2015/08/18/b/",
    ].join("\n");
    expect(filterPostUrls(raw)).toEqual(["/book/2017/01/22/ming/", "/life/2015/08/18/b/"]);
    expect(filterPostUrls(raw, { filter: "MING" })).toEqual(["/book/2017/01/22/ming/"]);
    expect(filterPostUrls(raw, { limit: 1 })).toEqual(["/book/2017/01/22/ming/"]);
  });

  it("compares fixture directories end-to-end and enforces --fail-on-error", () => {
    const base = mkdtempSync(join(tmpdir(), "mig4-fixture-"));
    tempDirs.push(base);
    const legacyDir = join(base, "legacy");
    const newDir = join(base, "new");
    const urlsFile = join(base, "urls.txt");
    const mapFile = join(base, "rewrite-map.json");
    const reportFile = join(base, "report.json");

    const postOk = "/book/2020/01/01/ok-post/";
    const postExpected = "/life/2015/08/18/b/";
    const postWarn = "/fe/2021/02/03/warn-post/";
    const postError = "/fe/2022/04/05/error-post/";
    const postMissing = "/fe/2023/06/07/missing-post/";

    // 1. OK post
    const okHtml = renderHtml({ canonical: `https://growgen.xyz${postOk}` });
    writePost(legacyDir, postOk, okHtml);
    writePost(newDir, postOk, okHtml);

    // 2. Expected-only post (origin + Astro local img -> Cloudinary + /tag/c#)
    writePost(
      legacyDir,
      postExpected,
      renderHtml({
        canonical: `https://growgen.xyz${postExpected}`,
        body: `<h2 id="h">Pic</h2><a href="/tag/c#">C#</a><img src="/_astro/beach.AbCd1234_Z9.webp" />`,
      }),
    );
    writePost(
      newDir,
      postExpected,
      renderHtml({
        canonical: `https://growgen.xyz${postExpected}`,
        body: `<h2 id="h">Pic</h2><a href="/tag/c%23">C#</a><img src="https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2015/08/18/b/beach" />`,
      }),
    );

    // 3. Warn post (minor description change)
    writePost(
      legacyDir,
      postWarn,
      renderHtml({ canonical: `https://growgen.xyz${postWarn}`, description: "Old desc" }),
    );
    writePost(
      newDir,
      postWarn,
      renderHtml({ canonical: `https://growgen.xyz${postWarn}`, description: "New desc" }),
    );

    // 4. Error post (missing heading + missing image)
    writePost(
      legacyDir,
      postError,
      renderHtml({
        canonical: `https://growgen.xyz${postError}`,
        body: `<h2 id="gone">Gone</h2><img src="https://cdn.example.com/a.png" /><p>Same body text here.</p>`,
      }),
    );
    writePost(
      newDir,
      postError,
      renderHtml({
        canonical: `https://growgen.xyz${postError}`,
        body: `<p>Same body text here.</p>`,
      }),
    );

    // 5. Missing in new
    writePost(legacyDir, postMissing, renderHtml({ canonical: `https://growgen.xyz${postMissing}` }));

    writeFileSync(
      urlsFile,
      ["# fixtures", "/", "/about/", postOk, postExpected, postWarn, postError, postMissing].join(
        "\n",
      ),
      "utf8",
    );
    writeFileSync(
      mapFile,
      JSON.stringify({
        posts: {
          "2015/08/18/B.md": {
            "./beach.jpg":
              "https://res.cloudinary.com/dmq8ipket/image/upload/growgen/legacy/2015/08/18/b/beach",
          },
        },
      }),
      "utf8",
    );

    // Run without --fail-on-error -> exits 0
    const stdout = execFileSync(
      process.execPath,
      [
        CLI_PATH,
        "--legacy",
        legacyDir,
        "--new",
        newDir,
        "--urls",
        urlsFile,
        "--rewrite-map",
        mapFile,
        "--out",
        reportFile,
      ],
      { encoding: "utf8" },
    );

    expect(stdout).toContain("MIG-4 DOM Parity Summary");
    expect(stdout).toContain("Total posts checked");

    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    expect(report.summary).toMatchObject({
      total: 5,
      ok: 1,
      expected: 1,
      warn: 1,
      error: 1,
      missingFiles: 1,
      missingLegacy: 0,
      missingNew: 1,
    });
    expect(report.missing).toEqual([
      { url: postMissing, missingLegacy: false, missingNew: true },
    ]);
    // Compact triage payload: only warn + error posts appear in flagged, error sorted first
    expect(report.flagged.map((f: { url: string; severity: string }) => [f.url, f.severity])).toEqual(
      [
        [postError, "error"],
        [postWarn, "warn"],
      ],
    );
    expect(Object.keys(report.flagged[1].diffs)).toEqual(["description"]);

    // Run with --fail-on-error -> exits 1
    let exitCode = 0;
    try {
      execFileSync(
        process.execPath,
        [
          CLI_PATH,
          "--legacy",
          legacyDir,
          "--new",
          newDir,
          "--urls",
          urlsFile,
          "--rewrite-map",
          mapFile,
          "--fail-on-error",
        ],
        { encoding: "utf8" },
      );
    } catch (err) {
      exitCode = (err as { status?: number }).status ?? -1;
    }
    expect(exitCode).toBe(1);

    // Verify --help exits 0
    const helpOut = execFileSync(process.execPath, [CLI_PATH, "--help"], { encoding: "utf8" });
    expect(helpOut).toContain("--fail-on-error");

    // Verify runBulkDiff directly with subset filter
    const okOnly = runBulkDiff({
      legacyDir,
      newDir,
      urls: [postOk, postExpected],
      rewriteMap: JSON.parse(readFileSync(mapFile, "utf8")),
    });
    expect(okOnly.summary.error).toBe(0);
    expect(okOnly.flagged).toEqual([]);
  });
});

describe("MIG-4 runner: isolated batches, new posts, --fail-on-warn", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function writePost(root: string, urlPath: string, html: string) {
    const dir = join(root, ...urlPath.replace(/^\/|\/$/g, "").split("/"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html, "utf8");
  }

  function fixture() {
    const base = mkdtempSync(join(tmpdir(), "mig4-iso-"));
    tempDirs.push(base);
    const legacyDir = join(base, "legacy");
    const newDir = join(base, "new");
    const urls = ["/fe/2020/01/01/a/", "/fe/2020/01/02/b/", "/fe/2020/01/03/c/"];
    for (const u of urls) writePost(legacyDir, u, renderHtml({ canonical: `https://growgen.xyz${u}` }));
    writePost(newDir, urls[0], renderHtml({ canonical: `https://growgen.xyz${urls[0]}` }));
    writePost(newDir, urls[1], renderHtml({ canonical: `https://growgen.xyz${urls[1]}`, description: "changed" }));
    writePost(newDir, urls[2], renderHtml({ canonical: `https://growgen.xyz${urls[2]}` }));
    writePost(newDir, "/fe/2026/11/25/brand-new/", renderHtml());
    const urlsFile = join(base, "urls.txt");
    writeFileSync(urlsFile, urls.join("\n"));
    return { base, legacyDir, newDir, urls, urlsFile };
  }

  it("runBulkDiffIsolated (child processes, batch size 1) equals the in-process report", async () => {
    const { legacyDir, newDir, urls } = fixture();
    const inProcess = runBulkDiff({ legacyDir, newDir, urls });
    const isolated = await runBulkDiffIsolated({ legacyDir, newDir, urls }, { batchSize: 1, concurrency: 2 });
    const strip = (r: { summary: Record<string, unknown> }) => ({
      ...r,
      generatedAt: 0,
      summary: { ...r.summary, durationMs: 0 },
    });
    expect(strip(isolated)).toEqual(strip(inProcess));
    expect(isolated.summary).toMatchObject({ total: 3, ok: 2, warn: 1, error: 0 });
  });

  it("findNewPosts lists post-shaped pages absent from the legacy list", () => {
    const { newDir, urls } = fixture();
    expect(findNewPosts(newDir, new Set(urls))).toEqual(["/fe/2026/11/25/brand-new/"]);
  });

  it("CLI reports new posts and content-root fallbacks; --fail-on-warn exits 1 while --fail-on-error exits 0", () => {
    const { legacyDir, newDir, urlsFile, base } = fixture();
    const reportFile = join(base, "r.json");
    const args = [CLI_PATH, "--legacy", legacyDir, "--new", newDir, "--urls", urlsFile, "--out", reportFile];
    const out = execFileSync(process.execPath, [...args, "--fail-on-error"], { encoding: "utf8" });
    expect(out).toContain("New posts (not in legacy)");
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    expect(report.newPosts).toEqual(["/fe/2026/11/25/brand-new/"]);
    expect(report.summary.contentRootFallbacks).toEqual({ legacy: 0, new: 0 });
    let code = 0;
    try {
      execFileSync(process.execPath, [...args, "--fail-on-warn"], { encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      code = (err as { status?: number }).status ?? -1;
    }
    expect(code).toBe(1);
  }, 60_000);
});
