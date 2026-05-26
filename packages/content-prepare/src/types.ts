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

export interface MetadataEntry {
  file: string;
  hash: string;
  city?: string[];
  locations?: Location[];
  cover?: Cover;
  colorSet?: ColorSet;
}

export interface CollectMetadataOptions {
  docsDir: string;
  outputDir: string;
  traceDir: string;
  googleApiKey?: string;
}
