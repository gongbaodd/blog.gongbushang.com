// usage: node parity.cjs <worktree> <legacyDist> <url> ...   -> structural diff of post content
const { createRequire } = require("node:module");
const fs = require("node:fs");
const [wt, legacy, ...urls] = process.argv.slice(2);
const { JSDOM } = createRequire(wt + "/package.json")("jsdom");

function info(file) {
	const dom = new JSDOM(fs.readFileSync(file, "utf8"));
	const d = dom.window.document;
	const cands = [...d.querySelectorAll("[class*='prose']")].filter((e) => /content/i.test(e.className) && !e.querySelector("h1.__none"));
	const el = cands[cands.length - 1] ?? d.querySelector("article");
	const text = (el?.textContent ?? "").replace(/\s+/g, " ").trim();
	const attrs = (sel, a) => [...el.querySelectorAll(sel)].map((x) => x.getAttribute(a));
	return {
		title: d.querySelector("title")?.textContent,
		h1: d.querySelector("h1")?.textContent,
		desc: d.querySelector("meta[name=description]")?.getAttribute("content"),
		canonical: d.querySelector("link[rel=canonical]")?.getAttribute("href"),
		text,
		headings: [...el.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => `${h.tagName}#${h.id}:${h.textContent.trim()}`),
		links: attrs("a[href]", "href"),
		imgs: attrs("img", "src"),
		counts: {
			katex: el.querySelectorAll(".katex").length,
			mermaid: el.querySelectorAll("pre.mermaid").length,
			code: el.querySelectorAll("pre.astro-code").length,
			plantuml: el.querySelectorAll("pre[data-language=plantuml]").length,
			iframe: el.querySelectorAll("iframe").length,
			table: el.querySelectorAll("table").length,
		},
		badges: [...d.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/(tag|series|world|[a-z]+$)/.test(h) && !/^\/(all|lab|world|year|cv|about)$/.test(h)).slice(0, 40),
	};
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const u of urls) {
	const n = info(`${wt}/apps/web/dist/client/${u}/index.html`);
	const o = info(`${legacy}/${u}/index.html`);
	console.log(`\n=== /${u}/`);
	for (const k of ["title", "h1", "desc", "canonical", "text", "headings", "links", "imgs", "counts"]) {
		const same = eq(n[k], o[k]);
		console.log(`${same ? "SAME" : "DIFF"}  ${k}`);
		if (!same) {
			if (k === "text") {
				let i = 0;
				while (i < n.text.length && n.text[i] === o.text[i]) i++;
				console.log(`   len new=${n.text.length} old=${o.text.length}; first diff @${i}`);
				console.log(`   new: ...${n.text.slice(Math.max(0, i - 40), i + 80)}`);
				console.log(`   old: ...${o.text.slice(Math.max(0, i - 40), i + 80)}`);
			} else if (Array.isArray(n[k])) {
				const nn = new Set(n[k]), oo = new Set(o[k]);
				console.log(`   only-new: ${JSON.stringify(n[k].filter((x) => !oo.has(x)).slice(0, 6))}`);
				console.log(`   only-old: ${JSON.stringify(o[k].filter((x) => !nn.has(x)).slice(0, 6))}`);
				console.log(`   (counts new=${n[k].length} old=${o[k].length})`);
			} else console.log(`   new=${JSON.stringify(n[k])}\n   old=${JSON.stringify(o[k])}`);
		}
	}
	console.log("badges new:", JSON.stringify(n.badges.slice(0, 14)));
	console.log("badges old:", JSON.stringify(o.badges.slice(0, 14)));
}
