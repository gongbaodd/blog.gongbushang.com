/**
 * Runtime entrypoint loaded by EmDash (`createMediaProvider`).
 * Loaded only inside the Cloudflare Worker, so `cloudflare:workers` is imported statically: a missing binding must fail loudly
 * instead of silently falling back to an empty `process.env`. The Node admin (apps/admin) does not load this file; it wraps
 * `createCloudinaryProvider` with a `process.env` lookup in `apps/admin/src/cloudinary-media.ts`.
 */
import { env as workersEnvBinding } from "cloudflare:workers";
import type { CreateMediaProviderFn } from "emdash/media";
import { createCloudinaryProvider, type CloudinaryMediaConfig, type EnvLookup } from "./provider";

/** Build an `EnvLookup` reading non-empty strings from Workers `env` first, then `process.env`. */
export function createRuntimeEnvLookup(
  workersEnv?: Record<string, unknown>,
  nodeEnv?: Record<string, string | undefined>,
): EnvLookup {
  return (name: string): string | undefined => {
    if (workersEnv) {
      try {
        const v = workersEnv[name];
        if (typeof v === "string" && v) return v;
      } catch {
        // Ignore if Workers env proxy throws outside a request context; fall back to process.env.
      }
    }
    const procEnv = nodeEnv ?? (typeof process !== "undefined" ? process.env : undefined);
    const pv = procEnv?.[name];
    return typeof pv === "string" && pv ? pv : undefined;
  };
}

const lookup = createRuntimeEnvLookup(workersEnvBinding as unknown as Record<string, unknown>);

export const createMediaProvider: CreateMediaProviderFn<CloudinaryMediaConfig> = (config) =>
  createCloudinaryProvider(config, lookup);
