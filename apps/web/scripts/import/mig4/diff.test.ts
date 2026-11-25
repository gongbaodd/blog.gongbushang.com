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
  filterPostUrls,
  levenshteinDistance,
  normalizeUrlForParity,
  runBulkDiff,
} from "./lib.mjs";

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

describe("MIG-4 lib: normalizeUrlForParity", () => {
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

  it("maps legacy external and Astro-hashed local images through mig2 rewrite-map.json", () => {
    const lookup = buildRewriteLookup(rewriteMap);

    const legacyExternal = normalizeUrlForParity(
      "http://ww1.sinaimg.cn/large/89d0a2e1gw1f2u8fh7uygj20tv0n4473.jpg",
      { rewriteMap: lookup, postPath: "/fe/2016/03/31/vue-riot-react/" },
    );
    const newExternal = normalizeUrlForParity(
      "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2016/03/31/vue-riot-react/21606f5a8988",
      { rewriteMap: lookup, postPath: "/fe/2016/03/31/vue-riot-react/" },
    );
    expect(legacyExternal).toBe(newExternal);

    const legacyAstroLocal = normalizeUrlForParity(
      "/_astro/89d0a2e1gw1evcern5sufj21kw16rnkw.CMylg40p_Z1gK9dp.webp",
      { rewriteMap: lookup, postPath: "/life/2015/08/18/b/" },
    );
    const newLocal = normalizeUrlForParity(
      "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/2015/08/18/b/73c11c4c5944",
      { rewriteMap: lookup, postPath: "/life/2015/08/18/b/" },
    );
    expect(legacyAstroLocal).toBe(newLocal);
  });

  it("normalizes Cloudinary f_auto,q_auto path transforms and query params while preserving other transforms", () => {
    expect(
      normalizeUrlForParity(
        "https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/v123/pic.jpg",
      ),
    ).toBe("https://res.cloudinary.com/dmq8ipket/image/upload/v123/pic.jpg");

    expect(
      normalizeUrlForParity(
        "https://res.cloudinary.com/dmq8ipket/image/upload/w_800,f_auto,q_auto/v123/pic.jpg?f_auto=1&q_auto=1",
      ),
    ).toBe("https://res.cloudinary.com/dmq8ipket/image/upload/w_800/v123/pic.jpg");
  });

  it("normalizes legacy vs new origins on canonical and absolute links", () => {
    expect(
      normalizeUrlForParity("https://next.growgen.xyz/book/2020/01/01/post/", {
        legacyOrigin: "https://growgen.xyz",
        newOrigin: "https://next.growgen.xyz",
      }),
    ).toBe("https://growgen.xyz/book/2020/01/01/post/");
  });

  it("normalizes encoded fragment tag links (/tag/c# -> /tag/c%23)", () => {
    expect(normalizeUrlForParity("/tag/c#")).toBe("/tag/c%23");
    expect(normalizeUrlForParity("https://next.growgen.xyz/tag/c#")).toBe(
      "https://growgen.xyz/tag/c%23",
    );
  });
});

describe("MIG-4 lib: diffPostDom", () => {
  const baseDom = extractPostDom(
    renderHtml({
      body: `
        <h2 id="s1">Section One</h2>
        <p>This is a sufficiently long body paragraph for parity testing across legacy and new builds.</p>
        <a href="/tag/c#">C#</a>
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
          <a href="/tag/c%23">C#</a>
          <img src="https://res.cloudinary.com/dmq8ipket/image/upload/f_auto,q_auto/growgen/legacy/abc" />
          <pre class="astro-code"><code>console.log(1)</code></pre>
        `,
      }),
    );

    const diff = diffPostDom(baseDom, newDom, {
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
        canonical: `https://next.growgen.xyz${postExpected}`,
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
