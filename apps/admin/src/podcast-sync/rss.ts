/**
 * Zero-dependency RSS URL validation, safe fetching, and XML parser for the Spotify/Anchor podcast feed.
 *
 * Parity with `apps/web/scripts/podcast/fetch-podcast.ts`:
 * - Episode `id` (used as `legacy_id`): last pathname segment of `<link>` (or `<guid>`), else `ep-<index>`
 * - `<itunes:duration>`: converts ISO-8601 `PT...` to `"Xh Ym Zs"`, preserves `HH:MM:SS` / `MM:SS` / seconds verbatim
 * - `<description>` -> `summary`: strips HTML tags and takes the first 200 characters
 */

export const DEFAULT_RSS_URL = "https://anchor.fm/s/f483db10/podcast/rss";
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export const MAX_RSS_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

export interface ChannelData {
	title: string;
	description: string;
	link: string;
	image: string;
}

export interface RssEpisode {
	id: string;
	title: string;
	link: string;
	pubDate: string;
	description: string;
	summary: string;
	duration: string;
	audioUrl: string;
	image: string;
}

export interface ParsedFeed {
	channel: ChannelData;
	episodes: RssEpisode[];
}

export interface ValidateRssUrlOptions {
	allowLocalHttp?: boolean;
}

export interface FetchRssOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
	maxBytes?: number;
	allowLocalHttp?: boolean;
	maxRedirects?: number;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DISALLOWED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google", "metadata.google.internal"]);
const DISALLOWED_HOST_SUFFIXES = [".localhost", ".internal", ".local", ".nip.io", ".sslip.io"];

export function isLoopbackHost(hostname: string): boolean {
	return LOOPBACK_HOSTS.has(hostname.toLowerCase().replace(/\.+$/, ""));
}

function isNonPublicIpv4(a: number, b: number, c: number, d: number): boolean {
	if ([a, b, c, d].some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
	if (a === 0) return true; // 0.0.0.0/8
	if (a === 10) return true; // 10.0.0.0/8
	if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
	if (a === 127) return true; // 127.0.0.0/8 (loopback)
	if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
	if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
	if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
	if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
	if (a === 192 && b === 168) return true; // 192.168.0.0/16
	if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
	if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
	if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
	if (a >= 224) return true; // multicast / reserved / broadcast
	return false;
}

function parseIpv6Hextets(raw: string): number[] | null {
	let addr = raw.toLowerCase();
	const zoneIdx = addr.indexOf("%");
	if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx);

	// Convert optional embedded IPv4 suffix (e.g. ::ffff:127.0.0.1) into two hextets
	const lastColon = addr.lastIndexOf(":");
	if (lastColon !== -1 && addr.slice(lastColon + 1).includes(".")) {
		const ipv4Part = addr.slice(lastColon + 1);
		const m = ipv4Part.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
		if (!m) return null;
		const octets = m.slice(1).map(Number);
		if (octets.some((n) => n < 0 || n > 255)) return null;
		const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
		const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
		addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
	}

	const halves = addr.split("::");
	if (halves.length > 2) return null;

	const parsePart = (part: string): number[] | null => {
		if (!part) return [];
		const parts = part.split(":");
		const nums: number[] = [];
		for (const p of parts) {
			if (!/^[0-9a-f]{1,4}$/.test(p)) return null;
			nums.push(Number.parseInt(p, 16));
		}
		return nums;
	};

	if (halves.length === 1) {
		const full = parsePart(halves[0]!);
		return full && full.length === 8 ? full : null;
	}

	const left = parsePart(halves[0]!);
	const right = parsePart(halves[1]!);
	if (!left || !right) return null;
	const missing = 8 - (left.length + right.length);
	if (missing < 1) return null;
	return [...left, ...new Array<number>(missing).fill(0), ...right];
}

function isNonPublicIpv6(bracketedOrRaw: string): boolean {
	const raw =
		bracketedOrRaw.startsWith("[") && bracketedOrRaw.endsWith("]")
			? bracketedOrRaw.slice(1, -1)
			: bracketedOrRaw;
	const h = parseIpv6Hextets(raw);
	if (!h) return true; // Fail closed on unparseable IPv6

	const firstSixZero = h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0;
	// Unspecified (::) and loopback (::1)
	if (firstSixZero && h[6] === 0 && (h[7] === 0 || h[7] === 1)) return true;

	// IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96)
	const isIpv4Mapped =
		h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0xffff;
	if (isIpv4Mapped || firstSixZero) {
		const a = (h[6]! >> 8) & 0xff;
		const b = h[6]! & 0xff;
		const c = (h[7]! >> 8) & 0xff;
		const d = h[7]! & 0xff;
		return isNonPublicIpv4(a, b, c, d);
	}

	if ((h[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 (unique local)
	if ((h[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 (link-local)
	if ((h[0]! & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
	if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // 2001:db8::/32 (documentation)
	return false;
}

/**
 * Returns true if the hostname refers to a loopback, private, link-local, metadata, or non-public address.
 * Note: WHATWG `new URL()` normalizes non-standard IPv4 forms (decimal/octal/hex) into dotted-quad IPv4
 * and IPv4-mapped IPv6 literals into bracketed hex IPv6 before this runs.
 */
export function isDisallowedRssHost(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/\.+$/, "");
	if (!host) return true;
	if (DISALLOWED_HOSTNAMES.has(host)) return true;
	if (DISALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;

	if (host.startsWith("[") && host.endsWith("]")) {
		return isNonPublicIpv6(host);
	}
	if (host.includes(":")) {
		return isNonPublicIpv6(host);
	}

	const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (ipv4) {
		return isNonPublicIpv4(Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4]));
	}
	return false;
}

/**
 * Validates an RSS feed URL against SSRF / credential-in-URL hazards.
 * - Rejects userinfo (`user:pass@`) unconditionally.
 * - Rejects non-public/private/link-local/metadata IP literals and internal hostnames (including on `https:` and redirects).
 * - Only `https:` is allowed on public hosts; loopback (`localhost`/`127.0.0.1`/`[::1]`) on `http:` or `https:`
 *   is allowed only when `allowLocalHttp` is true (`SITE_ENV=local` for local tests).
 */
export function validateRssUrl(rawUrl: string, options: ValidateRssUrlOptions = {}): string {
	const trimmed = rawUrl.trim();
	if (!trimmed) {
		throw new Error("PODCAST_RSS_URL is empty.");
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error("Invalid PODCAST_RSS_URL: must be a valid URL.");
	}
	if (parsed.username || parsed.password) {
		throw new Error("Invalid PODCAST_RSS_URL: credentials in URL are not allowed.");
	}

	const isLoopback = isLoopbackHost(parsed.hostname);
	if (options.allowLocalHttp && isLoopback && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
		return parsed.toString();
	}

	if (parsed.protocol !== "https:") {
		throw new Error(
			options.allowLocalHttp
				? "Invalid PODCAST_RSS_URL: must use https: (or http: on localhost/127.0.0.1 when SITE_ENV=local)."
				: "Invalid PODCAST_RSS_URL: must use https:.",
		);
	}

	if (isDisallowedRssHost(parsed.hostname)) {
		throw new Error("Invalid PODCAST_RSS_URL: private, loopback, or internal hosts are not allowed.");
	}

	return parsed.toString();
}

/**
 * Resolves the RSS URL exclusively from server runtime environment (`PODCAST_RSS_URL`) or the default feed URL.
 * Never reads URLs from request or Block Kit action inputs.
 */
export function resolveRssUrl(env: NodeJS.ProcessEnv = process.env): { url: string; allowLocalHttp: boolean } {
	const allowLocalHttp = env.SITE_ENV?.trim() === "local";
	const raw = env.PODCAST_RSS_URL?.trim();
	if (!raw) {
		return { url: DEFAULT_RSS_URL, allowLocalHttp };
	}
	return { url: validateRssUrl(raw, { allowLocalHttp }), allowLocalHttp };
}

/** Strips query string and hash when displaying the configured RSS URL in admin UI blocks. */
export function redactRssUrlForDisplay(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.origin}${parsed.pathname}`;
	} catch {
		return DEFAULT_RSS_URL;
	}
}

export function getEpisodeSlug(url: string): string {
	try {
		const parsed = new URL(url);
		const segments = parsed.pathname.split("/").filter(Boolean);
		return segments[segments.length - 1] || "unknown";
	} catch {
		return "unknown";
	}
}

export function parseDuration(duration: string): string {
	const trimmed = duration.trim();
	if (!trimmed) return "";

	const match = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
	if (!match) return trimmed;

	const [, hours, minutes, seconds] = match;
	const parts: string[] = [];
	if (hours) parts.push(`${hours}h`);
	if (minutes) parts.push(`${minutes}m`);
	if (seconds) parts.push(`${seconds}s`);

	return parts.length > 0 ? parts.join(" ") : trimmed;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
};

/**
 * Decodes standard XML named entities and decimal/hex character references in a single pass
 * (so double-escaped sequences like `&amp;lt;` decode once to `&lt;`).
 */
export function decodeXmlEntities(input: string): string {
	if (!input.includes("&")) return input;
	return input.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (full, body: string) => {
		if (body[0] === "#") {
			const isHex = body[1] === "x" || body[1] === "X";
			const cp = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
				return full;
			}
			return String.fromCodePoint(cp);
		}
		return NAMED_ENTITIES[body] ?? full;
	});
}

interface XmlElement {
	name: string;
	attrs: Record<string, string>;
	children: XmlElement[];
	text: string;
}

function parseAttributes(raw: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const len = raw.length;
	let i = 0;

	while (i < len) {
		while (i < len && /\s/.test(raw[i]!)) i++;
		if (i >= len) break;

		const nameStart = i;
		while (i < len && !/[\s=/>]/.test(raw[i]!)) i++;
		const name = raw.slice(nameStart, i);
		if (!name) {
			i++;
			continue;
		}

		while (i < len && /\s/.test(raw[i]!)) i++;
		if (raw[i] !== "=") {
			attrs[name] = "";
			continue;
		}
		i++; // skip '='
		while (i < len && /\s/.test(raw[i]!)) i++;

		const quote = raw[i];
		if (quote === '"' || quote === "'") {
			i++;
			const valStart = i;
			const closeIdx = raw.indexOf(quote, i);
			if (closeIdx === -1) {
				throw new Error(`Malformed XML: unterminated attribute value for "${name}".`);
			}
			attrs[name] = decodeXmlEntities(raw.slice(valStart, closeIdx));
			i = closeIdx + 1;
		} else {
			const valStart = i;
			while (i < len && !/\s/.test(raw[i]!)) i++;
			attrs[name] = decodeXmlEntities(raw.slice(valStart, i));
		}
	}

	return attrs;
}

/** Finds the closing `>` of a tag, respecting single- and double-quoted attribute values. */
function findTagEnd(xml: string, start: number): number {
	let quote: string | null = null;
	for (let i = start; i < xml.length; i++) {
		const ch = xml[i]!;
		if (quote) {
			if (ch === quote) quote = null;
		} else if (ch === '"' || ch === "'") {
			quote = ch;
		} else if (ch === ">") {
			return i;
		}
	}
	return -1;
}

/**
 * Lightweight, zero-dependency XML tree parser.
 * Supports CDATA, XML comments, processing instructions, DOCTYPE (ignored — no entity expansion),
 * multiline tags/attributes, self-closing tags, and namespace-prefixed tags.
 */
function parseXmlRoot(rawXml: string): XmlElement {
	const xml = rawXml.startsWith("\uFEFF") ? rawXml.slice(1) : rawXml;
	const len = xml.length;
	let pos = 0;
	const stack: XmlElement[] = [];
	let root: XmlElement | null = null;

	while (pos < len) {
		const lt = xml.indexOf("<", pos);
		if (lt === -1) {
			const tail = xml.slice(pos);
			if (stack.length > 0) {
				stack[stack.length - 1]!.text += decodeXmlEntities(tail);
			} else if (tail.trim().length > 0) {
				throw new Error("Malformed XML: unexpected trailing text outside root element.");
			}
			break;
		}

		if (lt > pos) {
			const chunk = xml.slice(pos, lt);
			if (stack.length > 0) {
				stack[stack.length - 1]!.text += decodeXmlEntities(chunk);
			} else if (chunk.trim().length > 0) {
				throw new Error("Malformed XML: unexpected text before root element.");
			}
		}

		// CDATA section — literal content, no entity decoding
		if (xml.startsWith("<![CDATA[", lt)) {
			const end = xml.indexOf("]]>", lt + 9);
			if (end === -1) {
				throw new Error("Malformed XML: unclosed CDATA section.");
			}
			if (stack.length > 0) {
				stack[stack.length - 1]!.text += xml.slice(lt + 9, end);
			}
			pos = end + 3;
			continue;
		}

		// Comment
		if (xml.startsWith("<!--", lt)) {
			const end = xml.indexOf("-->", lt + 4);
			if (end === -1) {
				throw new Error("Malformed XML: unclosed comment.");
			}
			pos = end + 3;
			continue;
		}

		// Processing instruction (e.g. <?xml ...?>)
		if (xml.startsWith("<?", lt)) {
			const end = xml.indexOf("?>", lt + 2);
			if (end === -1) {
				throw new Error("Malformed XML: unclosed processing instruction.");
			}
			pos = end + 2;
			continue;
		}

		// DOCTYPE or other declaration (ignored safely without DTD expansion)
		if (xml.startsWith("<!", lt)) {
			let i = lt + 2;
			let depth = 0;
			let quote: string | null = null;
			let end = -1;
			while (i < len) {
				const ch = xml[i]!;
				if (quote) {
					if (ch === quote) quote = null;
				} else if (ch === '"' || ch === "'") {
					quote = ch;
				} else if (ch === "[") {
					depth++;
				} else if (ch === "]" && depth > 0) {
					depth--;
				} else if (ch === ">" && depth === 0) {
					end = i;
					break;
				}
				i++;
			}
			if (end === -1) {
				throw new Error("Malformed XML: unclosed declaration.");
			}
			pos = end + 1;
			continue;
		}

		// Closing tag
		if (xml[lt + 1] === "/") {
			const gt = xml.indexOf(">", lt + 2);
			if (gt === -1) {
				throw new Error("Malformed XML: unclosed closing tag.");
			}
			const closeName = xml.slice(lt + 2, gt).trim();
			const top = stack.pop();
			if (!top || top.name !== closeName) {
				throw new Error(
					`Malformed XML: unexpected closing tag </${closeName}>${top ? ` (expected </${top.name}>)` : ""}.`,
				);
			}
			pos = gt + 1;
			continue;
		}

		// Opening or self-closing tag
		const gt = findTagEnd(xml, lt + 1);
		if (gt === -1) {
			throw new Error("Malformed XML: unclosed opening tag.");
		}
		const inside = xml.slice(lt + 1, gt);
		const selfClosing = inside.trimEnd().endsWith("/");
		const header = selfClosing ? inside.trimEnd().slice(0, -1) : inside;
		const nameMatch = header.match(/^([^\s/>]+)([\s\S]*)$/);
		if (!nameMatch) {
			throw new Error("Malformed XML: empty tag name.");
		}
		const tagName = nameMatch[1]!;
		const attrRaw = nameMatch[2] ?? "";
		const el: XmlElement = {
			name: tagName,
			attrs: attrRaw.trim().length > 0 ? parseAttributes(attrRaw) : {},
			children: [],
			text: "",
		};

		if (stack.length > 0) {
			stack[stack.length - 1]!.children.push(el);
		} else {
			if (root) {
				throw new Error("Malformed XML: multiple root elements.");
			}
			root = el;
		}

		if (!selfClosing) {
			stack.push(el);
		}
		pos = gt + 1;
	}

	if (stack.length > 0) {
		throw new Error(`Malformed XML: unclosed tag <${stack[stack.length - 1]!.name}>.`);
	}
	if (!root) {
		throw new Error("Malformed XML: empty document.");
	}
	return root;
}

function childByName(el: XmlElement, name: string): XmlElement | undefined {
	return el.children.find((c) => c.name === name);
}

function childText(el: XmlElement, name: string): string | undefined {
	const c = childByName(el, name);
	return c ? c.text : undefined;
}

/** Parses an RSS 2.0 XML string into channel metadata and episodes. */
export function parseRssXml(xml: string): ParsedFeed {
	const root = parseXmlRoot(xml);
	if (root.name !== "rss") {
		throw new Error(`Invalid RSS feed: expected <rss> root element, got <${root.name}>.`);
	}
	const channelEl = childByName(root, "channel");
	if (!channelEl) {
		throw new Error("Invalid RSS feed: missing <channel> element.");
	}

	const channelImageEl = childByName(channelEl, "image");
	const channelItunesImage = childByName(channelEl, "itunes:image");

	const channel: ChannelData = {
		title: childText(channelEl, "title")?.trim() || "Podcast",
		description: childText(channelEl, "description")?.trim() || "",
		link: childText(channelEl, "link")?.trim() || "",
		image:
			(channelImageEl ? childText(channelImageEl, "url")?.trim() : undefined) ||
			channelItunesImage?.attrs.href?.trim() ||
			"",
	};

	const itemEls = channelEl.children.filter((c) => c.name === "item");
	const episodes: RssEpisode[] = itemEls.map((item, index) => {
		const title = childText(item, "title")?.trim() || "Untitled";
		const link = childText(item, "link")?.trim() || childText(item, "guid")?.trim() || "";
		const pubDate = childText(item, "pubDate")?.trim() || "";
		const description =
			childText(item, "description")?.trim() ||
			childText(item, "summary")?.trim() ||
			childText(item, "itunes:summary")?.trim() ||
			"";
		const summary = description.replace(/<[^>]*>/g, "").substring(0, 200).trim();
		const durationRaw = childText(item, "itunes:duration") ?? "";
		const duration = durationRaw ? parseDuration(durationRaw) : "";

		const itunesImage = childByName(item, "itunes:image");
		const imageEl = childByName(item, "image");
		const image =
			itunesImage?.attrs.href?.trim() ||
			(imageEl ? childText(imageEl, "url")?.trim() : undefined) ||
			"";

		const enclosure = childByName(item, "enclosure");
		const audioUrl = enclosure?.attrs.url?.trim() || "";

		const id = link ? getEpisodeSlug(link) : `ep-${index}`;

		return {
			id,
			title,
			link,
			pubDate,
			description,
			summary,
			duration,
			audioUrl,
			image,
		};
	});

	return { channel, episodes };
}

async function readTextWithLimit(res: Response, maxBytes: number): Promise<string> {
	const contentLength = res.headers.get("content-length");
	if (contentLength) {
		const declared = Number(contentLength);
		if (Number.isFinite(declared) && declared > maxBytes) {
			throw new Error(`RSS feed exceeds maximum allowed size (${maxBytes} bytes).`);
		}
	}

	if (!res.body) {
		const buf = await res.arrayBuffer();
		if (buf.byteLength > maxBytes) {
			throw new Error(`RSS feed exceeds maximum allowed size (${maxBytes} bytes).`);
		}
		return new TextDecoder("utf-8").decode(buf);
	}

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => {});
				throw new Error(`RSS feed exceeds maximum allowed size (${maxBytes} bytes).`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder("utf-8").decode(merged);
}

/**
 * Fetches and parses an RSS feed with strict URL validation on initial request and every redirect hop,
 * request timeout, and response size cap.
 */
export async function fetchRssFeed(rssUrl: string, options: FetchRssOptions = {}): Promise<ParsedFeed> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
	const maxBytes = options.maxBytes ?? MAX_RSS_BYTES;
	const allowLocalHttp = options.allowLocalHttp ?? false;
	const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

	let currentUrl = validateRssUrl(rssUrl, { allowLocalHttp });
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		for (let hops = 0; hops <= maxRedirects; hops++) {
			let res: Response;
			try {
				res = await fetchImpl(currentUrl, {
					method: "GET",
					redirect: "manual",
					signal: controller.signal,
					headers: {
						Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.1",
						"User-Agent": "growgen-emdash-podcast-sync",
					},
				});
			} catch (err) {
				if (controller.signal.aborted) {
					throw new Error(`RSS fetch timed out after ${timeoutMs}ms.`);
				}
				const message = err instanceof Error ? err.message : String(err);
				throw new Error(`RSS fetch failed: ${message}`);
			}

			if (REDIRECT_STATUSES.has(res.status)) {
				await res.body?.cancel().catch(() => {});
				const location = res.headers.get("location");
				if (!location) {
					throw new Error(`RSS fetch received redirect (${res.status}) without Location header.`);
				}
				if (hops >= maxRedirects) {
					throw new Error(`RSS fetch exceeded maximum redirects (${maxRedirects}).`);
				}
				const nextRaw = new URL(location, currentUrl).toString();
				currentUrl = validateRssUrl(nextRaw, { allowLocalHttp });
				continue;
			}

			if (!res.ok) {
				await res.body?.cancel().catch(() => {});
				throw new Error(`RSS fetch failed with HTTP ${res.status}.`);
			}

			let xml: string;
			try {
				xml = await readTextWithLimit(res, maxBytes);
			} catch (err) {
				if (controller.signal.aborted) {
					throw new Error(`RSS fetch timed out after ${timeoutMs}ms.`);
				}
				throw err;
			}
			return parseRssXml(xml);
		}
		throw new Error(`RSS fetch exceeded maximum redirects (${maxRedirects}).`);
	} finally {
		clearTimeout(timer);
	}
}
