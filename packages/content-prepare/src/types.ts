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
  city?: string[];
  locations?: Location[];
  cover?: Cover;
  colorSet?: ColorSet;
}

export interface CollectMetadataOptions {
  docsDir: string;
  outputFile: string;
  traceDir: string;
  googleApiKey?: string;
}
