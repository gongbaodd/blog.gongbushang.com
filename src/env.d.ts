/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module "read-time-estimate" {
  interface ReadTimeEstimateOptions {
    wordsPerMinute?: number;
    wordsPerSecond?: number;
    secondsPerImage?: number;
    imageTags?: string[];
    excludeCodeBlocks?: boolean;
  }

  interface ReadTimeEstimateResult {
    text: string;
    minutes: number;
    time: number;
    words: number;
    images: number;
    images_time: number;
  }

  function readTimeEstimate(
    text: string,
    options?: ReadTimeEstimateOptions
  ): ReadTimeEstimateResult;

  export = readTimeEstimate;
}
