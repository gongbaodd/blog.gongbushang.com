// INF-10: DERIVE_READONLY=1 must make every derived-cache write a no-op (PR CI builds against the production DB).
import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (readonly: boolean) => {
	vi.resetModules();
	if (readonly) vi.stubEnv("DERIVE_READONLY", "1");
	else vi.unstubAllEnvs();
	return import("./cache.ts");
};
const client = () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) });

afterEach(() => vi.unstubAllEnvs());

describe("DERIVE_READONLY=1", () => {
	it("never issues a query from any cache write", async () => {
		const c = await load(true);
		const db = client();
		const cl = db as never;
		await c.saveHints(cl, [{ legacyId: "a", tags: [], cities: [] }]);
		await c.upsertEmbedding(cl, "a", "h", "m", [0.1]);
		await c.upsertEmbedding(cl, "a", "h", "m", [0.1], "podcast_embeddings");
		expect(await c.pruneEmbeddings(cl, ["a"])).toBe(0);
		await c.upsertTrace(cl, "u", { svg: "<svg/>", colorSet: { bgColor: "#fff", titleColor: "#000" } });
		expect(await c.pruneTraces(cl, ["u"])).toBe(0);
		await c.upsertColor(cl, "u", { bgColor: "#fff", titleColor: "#000" });
		expect(await c.pruneColors(cl, ["u"])).toBe(0);
		await c.upsertGeocode(cl, "Tallinn", { latitude: 1, longitude: 2 });
		await c.saveUmapState(cl, { inputHash: "i", paramsHash: "p", count: 1, coordinates: {} });
		expect(db.query).not.toHaveBeenCalled();
	});

	it("still reads", async () => {
		const c = await load(true);
		const db = client();
		await c.loadHints(db as never);
		expect(db.query).toHaveBeenCalledTimes(1);
	});

	it("writes normally without the flag (and for any value but exactly 1)", async () => {
		const c = await load(false);
		const db = client();
		await c.upsertColor(db as never, "u", { bgColor: "#fff", titleColor: "#000" });
		expect(db.query).toHaveBeenCalledTimes(1);
	});
});
