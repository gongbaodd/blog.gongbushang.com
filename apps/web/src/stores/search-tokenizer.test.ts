import { describe, expect, test } from "vitest";
import MiniSearch from "minisearch";
import { createTokenizer, tokenize, hasCjk } from "./search-tokenizer";
import { indexOptions } from "./search-options";

describe("tokenizer", () => {
  test("English is lowercased and split on punctuation", () => {
    expect(tokenize("Hello, World! Astro-Cloudflare")).toEqual(["hello", "world", "astro", "cloudflare"]);
  });

  test("unspaced Chinese yields tokens inside the sentence", () => {
    const t = tokenize("我喜欢玩电子游戏");
    expect(t).toContain("游戏");
    expect(t).toContain("电子");
  });

  test("fallback without Segmenter emits unigrams and bigrams", () => {
    const t = createTokenizer(null)("电子游戏");
    expect(t).toEqual(expect.arrayContaining(["电", "子", "游", "戏", "电子", "子游", "游戏"]));
  });

  test("mixed text keeps both scripts", () => {
    const t = createTokenizer(null)("用React写游戏 demo");
    expect(t).toEqual(expect.arrayContaining(["react", "游戏", "demo"]));
  });

  test("empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("hasCjk", () => {
    expect(hasCjk("游")).toBe(true);
    expect(hasCjk("game")).toBe(false);
  });
});

describe("search options", () => {
  const docs = [
    { id: "1", title: "Rust 入门", content: "今天聊聊编程语言" },
    { id: "2", title: "随笔", content: "周末在家玩电子游戏，很开心" },
    { id: "3", title: "Astro tutorial", content: "Building a blog with islands" },
    { id: "4", title: "Notes", content: "I wrote an astro helper once" },
  ];
  const make = (tok?: (s: string) => string[]) => {
    const ms = new MiniSearch({
      ...indexOptions,
      ...(tok ? { tokenize: tok, searchOptions: { ...indexOptions.searchOptions, tokenize: tok } } : {}),
    });
    ms.addAll(docs);
    return ms;
  };

  test.each([
    ["Segmenter", undefined],
    ["fallback", createTokenizer(null)],
  ] as const)("Chinese word inside a sentence matches (%s)", (_n, tok) => {
    expect(make(tok).search("游戏").map((r) => r.id)).toEqual(["2"]);
  });

  test("English prefix and fuzzy match", () => {
    const ms = make();
    expect(ms.search("tutor").map((r) => r.id)).toContain("3");
    expect(ms.search("islnds").map((r) => r.id)).toContain("3");
  });

  test("title matches rank above content matches", () => {
    expect(make().search("astro")[0].id).toBe("3");
  });

  test("CJK terms are not fuzzy matched", () => {
    expect(make().search("游玩")).toEqual([]);
  });
});
