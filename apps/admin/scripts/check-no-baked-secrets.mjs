#!/usr/bin/env node
// SEC-02 canary build. Builds apps/admin with a fresh random canary value for every private (non-PUBLIC_) variable in
// .env.example plus the secret-bearing names below, then fails if any canary (or its URL-encoded form) appears in the output.
// Output goes to a temporary outDir, so apps/admin/dist is never touched. Only file paths and variable names are printed,
// never canary values.
//
// EMDASH_SITE_URL is excluded on purpose: it is baked by design (it is the public origin; see runbooks/admin-docker.md).
// Anything named PUBLIC_* is baked by design too, so a secret must never use that prefix.
// PORT is excluded: Astro's own runtime uses `import.meta.env?.PROD`, and its inliner bakes every env var whose name is a
// substring of that file ("PORT" is inside "IMPORT"/"EXPORT"). It is a listen port, not a credential; the image sets PORT at runtime.
// Lesson: a short secret name (KEY, TOKEN, HOST...) could be baked the same way; give secrets distinctive names and list them in .env.example.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BAKED_BY_DESIGN = new Set(["EMDASH_SITE_URL", "PORT"]);
const EXTRA_NAMES = [
	"SETUP_TOKEN",
	"CF_ACCESS_TEAM_DOMAIN",
	"CF_ACCESS_AUD",
	"GITHUB_DISPATCH_TOKEN",
	"CLOUDINARY_API_SECRET",
	"CLOUDINARY_API_KEY",
	"EMDASH_ENCRYPTION_KEY",
	"DATABASE_CA_CERT",
	"DATABASE_URL",
];

const token = (name) => `cnry${name.toLowerCase().replace(/[^a-z0-9]/g, "")}${randomBytes(4).toString("hex")}`;

async function main() {
	const names = [
		...new Set([
			...(await readFile(join(appDir, ".env.example"), "utf8"))
				.split("\n")
				.map((l) => l.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
				.filter(Boolean),
			...EXTRA_NAMES,
		]),
	].filter((n) => !n.startsWith("PUBLIC_") && !BAKED_BY_DESIGN.has(n));

	// label -> canary value. DATABASE_URL is split so its user, password and host are each checked on their own.
	const markers = new Map();
	const env = {};
	for (const name of names) {
		if (name === "DATABASE_URL") {
			const user = token("dbuser");
			const pass = token("dbpass");
			const host = `${token("dbhost")}.invalid`;
			const db = token("dbname");
			const url = `postgresql://${user}:${pass}@${host}:6543/${db}`;
			env[name] = url;
			markers.set("DATABASE_URL (user)", user);
			markers.set("DATABASE_URL (password)", pass);
			markers.set("DATABASE_URL (host)", host);
			markers.set("DATABASE_URL (database)", db);
			markers.set("DATABASE_URL (whole)", url);
		} else {
			const value = token(name);
			env[name] = value;
			markers.set(name, value);
		}
	}

	const outDir = await mkdtemp(join(tmpdir(), "admin-canary-"));
	try {
		const build = spawnSync("pnpm", ["exec", "astro", "build", "--outDir", outDir], {
			cwd: appDir,
			env: { ...process.env, ...env, ASTRO_TELEMETRY_DISABLED: "1" },
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
		});
		if (build.status !== 0) {
			console.error(`check-no-baked-secrets: canary build failed (exit ${build.status}); its output is not printed.`);
			return 2;
		}

		// Needles: each raw value, plus its URL-encoded form when that differs.
		const needles = [];
		for (const [label, value] of markers) {
			needles.push({ label, text: value });
			const enc = encodeURIComponent(value);
			if (enc !== value) needles.push({ label: `${label} [url-encoded]`, text: enc });
		}

		const hits = [];
		let scanned = 0;
		const scanText = (where, text) => {
			for (const { label, text: needle } of needles) if (text.includes(needle)) hits.push({ where, label });
		};
		const walk = async (dir) => {
			for (const entry of await readdir(dir, { withFileTypes: true })) {
				const full = join(dir, entry.name);
				if (entry.isDirectory()) await walk(full);
				else if (entry.isFile()) {
					scanned++;
					scanText(relative(appDir, full), await readFile(full, "latin1"));
				}
			}
		};
		await walk(outDir);
		scanText("<astro build output>", `${build.stdout}\n${build.stderr}`);

		if (scanned === 0) {
			console.error("check-no-baked-secrets: canary build produced no files.");
			return 2;
		}
		if (hits.length > 0) {
			console.error("check-no-baked-secrets: canary values were baked into the build output:");
			for (const { where, label } of hits) console.error(`  - ${where} (${label})`);
			return 1;
		}
		console.log(`check-no-baked-secrets: OK (${scanned} files scanned, ${markers.size} canaries, no hits).`);
		return 0;
	} finally {
		await rm(outDir, { recursive: true, force: true });
	}
}

process.exitCode = await main();
