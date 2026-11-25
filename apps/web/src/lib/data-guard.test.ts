import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const script = resolve(root, "scripts/derive/index.ts");
const run = (env: Record<string, string>) =>
  spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });

const deadDb = "postgresql://postgres:postgres@127.0.0.1:1/postgres";

describe("derive build guard (DATA-1, PORT-8, MIG-3)", () => {
  it("fails when the database cannot be reached", () => {
    expect(run({ DERIVE_DATABASE_URL: deadDb, ALLOW_EMPTY_DATA: "" }).status).not.toBe(0);
  });

  it("does not need the legacy content submodule (MIG-3)", () => {
    // LEGACY_GENERATED_DIR is only consulted with DERIVE_PARITY_LEGACY=1; a bad path must not be what fails.
    const r = run({ LEGACY_GENERATED_DIR: "/nonexistent", DERIVE_DATABASE_URL: deadDb });
    expect(r.stderr).not.toContain("no generated data");
    expect(r.stderr).not.toContain("/nonexistent");
  });
});
