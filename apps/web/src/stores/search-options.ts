import type { Options, SearchOptions } from "minisearch";
import { hasCjk, tokenize } from "./search-tokenizer";

export const INDEX_FIELDS = ["title", "content"];
export const STORE_FIELDS = ["id", "href", "title", "date", "content", "category", "tags", "series"];

export const searchOptions: SearchOptions = {
  tokenize,
  prefix: true,
  // Light typo tolerance for Latin words only; fuzzy on CJK bigrams would match unrelated characters.
  fuzzy: (term) => (hasCjk(term) || term.length < 4 ? false : 0.2),
  boost: { title: 3 },
};

export const indexOptions: Options = {
  fields: INDEX_FIELDS,
  storeFields: STORE_FIELDS,
  tokenize,
  searchOptions,
};
