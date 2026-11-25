// Runs the repo-root Cucumber e2e suite (and the hydration check) against apps/web.
//
//   node scripts/e2e.mjs                    build (no analytics token), serve dist-e2e/client, run all but @analytics-on
//   node scripts/e2e.mjs --analytics-on     build with a fake Mixpanel token + host, run @analytics-on only
//   node scripts/e2e.mjs --hydration        build, serve, run scripts/hydration-check.mjs over tests/hydration-routes.txt
//   --skip-build                            reuse an existing dist-e2e/client (it must match the mode you run)
//   --tags "<expr>"                         override the Cucumber tag expression
//
// Env: E2E_PORT (default: a free port), E2E_CHROME_CHANNEL (e.g. "chrome" when Playwright's bundled
// Chromium is not installed), CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE (defaults to the
// local Supabase stack), E2E_PDFS=1 (also generate the resume PDFs; skipped by default).
//
// The site is a fully prerendered static build, so `dist/client` is served by a tiny static server
// (directory indexes, 404.html) instead of the Worker. SITE_ENV=production is set because analytics only
// runs on a production build (src/analytics/env.ts); PUBLIC_MIXPANEL_TOKEN stays empty unless --analytics-on.
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import net from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repoRoot = resolve(webRoot, "../..");
// Separate outDir: the fake-token / no-PDF production build must never overwrite the real apps/web/dist.
const outDirName = "dist-e2e";
const client = join(webRoot, outDirName, "client");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const analyticsOn = flag("--analytics-on");
const hydration = flag("--hydration");

const MIME = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".ndjson": "application/x-ndjson",
	".xml": "application/xml",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
	".avif": "image/avif",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".wasm": "application/wasm",
	".txt": "text/plain; charset=utf-8",
	".pdf": "application/pdf",
};

function freePort() {
	return new Promise((res, rej) => {
		const s = net.createServer();
		s.once("error", rej);
		s.listen(0, "127.0.0.1", () => {
			const { port } = s.address();
			s.close(() => res(port));
		});
	});
}

function run(cmd, cmdArgs, opts) {
	return new Promise((res) => {
		const child = spawn(cmd, cmdArgs, { stdio: "inherit", ...opts });
		child.on("exit", (code) => res(code ?? 1));
		child.on("error", () => res(1));
	});
}

function serve(port) {
	const server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", "http://x");
		// Fake Mixpanel ingestion host baked into the analytics-on build (the suite intercepts it anyway).
		if (url.pathname.startsWith("/__mp")) {
			res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
			res.end('{"status":1}');
			return;
		}
		let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
		let file = join(client, path);
		if (!file.startsWith(client)) file = client;
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
		let status = 200;
		if (!existsSync(file)) {
			file = join(client, "404.html");
			status = 404;
		}
		res.writeHead(status, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
		if (req.method === "HEAD") return res.end();
		createReadStream(file).pipe(res);
	});
	return new Promise((res) => server.listen(port, "127.0.0.1", () => res(server)));
}

const port = Number(process.env.E2E_PORT) || (await freePort());
const base = `http://127.0.0.1:${port}`;

if (!flag("--skip-build")) {
	const env = {
		...process.env,
		SITE_ENV: "production",
		ASTRO_OUT_DIR: outDirName,
		PUBLIC_MIXPANEL_TOKEN: analyticsOn ? "e2e-test-token" : "",
		PUBLIC_MIXPANEL_API_HOST: analyticsOn ? `${base}/__mp` : "",
		SKIP_PDFS: process.env.E2E_PDFS === "1" ? "" : "1",
		CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
			process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE ??
			"postgresql://postgres:postgres@127.0.0.1:54322/postgres",
	};
	console.log(`[e2e] building apps/web (${analyticsOn ? "analytics on" : "analytics off"}, ${base})`);
	const code = await run("pnpm", ["build"], { cwd: webRoot, env });
	if (code !== 0) process.exit(code);
}
if (!existsSync(join(client, "index.html"))) {
	console.error(`[e2e] ${client} has no index.html; build first`);
	process.exit(1);
}

const server = await serve(port);
console.log(`[e2e] serving ${outDirName}/client at ${base}`);
let code = 1;
try {
	if (hydration) {
		code = await run("node", [join(repoRoot, "scripts/hydration-check.mjs"), base], {
			cwd: repoRoot,
			env: { ...process.env, HYD_ROUTES_FILE: join(webRoot, "tests/hydration-routes.txt") },
		});
	} else {
		const tags = value("--tags") ?? (analyticsOn ? "@analytics-on" : "not @analytics-on");
		code = await run("pnpm", ["exec", "cucumber-js", "--config", "cucumber.mjs", "--tags", tags], {
			cwd: repoRoot,
			env: { ...process.env, E2E_BASE_URL: base },
		});
	}
} finally {
	server.close();
}
process.exit(code);
