export { collectMetadata } from "./collect-metadata.ts";
export {
  findRepoRoot,
  parseCliArgs,
  resolveCollectOptions,
  runCli,
} from "./cli.ts";
export { toMetadataSlug, toUnixPath } from "./path-utils.ts";
export type {
  CollectMetadataOptions,
  Cover,
  ColorSet,
  Location,
  MetadataEntry,
} from "./types.ts";
