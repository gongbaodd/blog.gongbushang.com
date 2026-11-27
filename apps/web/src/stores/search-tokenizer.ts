/**
 * Tokenizer shared by indexing and querying (minisearch `tokenize` and `searchOptions.tokenize`).
 * CJK text has no spaces, so default whitespace splitting leaves a whole sentence as one token.
 */

/** Han, Hiragana, Katakana (incl. extensions) and Hangul. */
const CJK = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af";
const CJK_RUN = new RegExp(`[${CJK}]+`, "g");
const CJK_TEST = new RegExp(`[${CJK}]`);
const NON_WORD = /[^\p{L}\p{N}]+/u;

export function hasCjk(term: string): boolean {
  return CJK_TEST.test(term);
}

export type WordSegmenter = { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function createSegmenter(): WordSegmenter | null {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => WordSegmenter }).Segmenter;
    return Seg ? new Seg("zh", { granularity: "word" }) : null;
  } catch {
    return null;
  }
}

const defaultSegmenter = createSegmenter();

/** Words from `Intl.Segmenter` when given, else unigrams; plus bigrams so partial words still match. */
function cjkTokens(run: string, segmenter: WordSegmenter | null): string[] {
  const out = new Set<string>();
  const chars = Array.from(run);
  if (segmenter) {
    for (const part of segmenter.segment(run)) {
      if (part.isWordLike !== false) out.add(part.segment);
    }
  } else {
    for (const c of chars) out.add(c);
  }
  for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1]);
  return [...out];
}

export function createTokenizer(segmenter: WordSegmenter | null = defaultSegmenter) {
  return (text: string): string[] => {
    if (!text) return [];
    const tokens: string[] = [];
    let last = 0;
    const flushLatin = (s: string) => {
      for (const t of s.toLowerCase().split(NON_WORD)) if (t) tokens.push(t);
    };
    for (const m of text.matchAll(CJK_RUN)) {
      flushLatin(text.slice(last, m.index));
      tokens.push(...cjkTokens(m[0], segmenter));
      last = m.index + m[0].length;
    }
    flushLatin(text.slice(last));
    return tokens;
  };
}

export const tokenize = createTokenizer();
