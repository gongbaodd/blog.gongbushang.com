import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import {
  runUmapBinary,
  type UmapBinaryDeps,
} from "./run-umap-binary.ts";
import { UMAP_2D_CONFIG } from "./umap-params.ts";

class MockChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
}

function createDeps(spawnMock: ReturnType<typeof vi.fn>): UmapBinaryDeps {
  return {
    findRepoRoot: vi.fn(async () => "/repo"),
    access: vi.fn(async () => undefined),
    spawn: spawnMock,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("runUmapBinary", () => {
  test("sends embeddings JSON on stdin and parses coordinates from stdout", async () => {
    const child = new MockChild();
    const spawnMock = vi.fn(() => child as never);
    const deps = createDeps(spawnMock);

    const promise = runUmapBinary(
      [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      deps,
    );

    await flushAsyncWork();

    expect(spawnMock).toHaveBeenCalledWith(
      "/repo/target/release/umap",
      [],
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(child.stdin.write).toHaveBeenCalledWith(
      JSON.stringify({
        embeddings: [[0.1, 0.2], [0.3, 0.4]],
        config: UMAP_2D_CONFIG,
      }),
    );
    expect(child.stdin.end).toHaveBeenCalled();

    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ coordinates: [[1, 2], [3, 4]] })),
    );
    child.emit("close", 0);

    await expect(promise).resolves.toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  test("throws when the process exits non-zero", async () => {
    const child = new MockChild();
    const spawnMock = vi.fn(() => child as never);
    const deps = createDeps(spawnMock);

    const promise = runUmapBinary([[0.1, 0.2], [0.3, 0.4]], deps);
    await flushAsyncWork();
    child.stderr.emit("data", Buffer.from("invalid input"));
    child.emit("close", 1);

    await expect(promise).rejects.toThrow("invalid input");
  });

  test("throws when the UMAP binary is missing", async () => {
    const deps: UmapBinaryDeps = {
      findRepoRoot: vi.fn(async () => "/repo"),
      access: vi.fn(async () => {
        throw new Error("missing");
      }),
      spawn: vi.fn(),
    };

    await expect(runUmapBinary([[0.1, 0.2], [0.3, 0.4]], deps)).rejects.toThrow(
      "Run `pnpm umap:build` first.",
    );
    expect(deps.spawn).not.toHaveBeenCalled();
  });
});
