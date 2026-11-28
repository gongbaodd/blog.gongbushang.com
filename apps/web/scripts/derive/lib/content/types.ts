export interface Location {
  latitude: number;
  longitude: number;
}

export interface Cover {
  url: string;
  alt?: string;
}

export interface ColorSet {
  bgColor: string;
  titleColor: string;
}

export interface Link {
  label: string;
  href: string;
}

export interface MetadataEntry {
  file: string;
  hash: string;
  id: string;
  href: string;
  title: string;
  date: string;
  content: string;
  /** Optional since GON-270 (the post URL has no category). */
  category?: Link;
  tags: Link[];
  series?: Link;
  city?: string[];
  locations?: Location[];
  cover?: Cover;
  colorSet?: ColorSet;
  embeddings?: number[];
  /** Body is shorter than `SHORT_POST_WORDS`; short posts relate to other short posts. */
  isShort?: boolean;
}
