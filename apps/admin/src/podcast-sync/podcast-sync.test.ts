import { afterEach, describe, expect, it, vi } from "vitest";
import { PODCAST_CHANNEL } from "../../../web/src/lib/podcast-channel.ts";
import {
	clearSuppressedPublishDispatches,
	createPlugin as createRebuildPlugin,
	dispatchFromNodeEnv,
	type Logger,
} from "../rebuild-on-publish.ts";
import {
	ACTION_CHECK_RSS,
	ACTION_RUN_SYNC,
	PODCAST_SYNC_PAGE_PATH,
	sanitizeErrorMessage,
	type BlockResponse,
} from "./blocks.ts";
import { createAdminRouteHandler, createPlugin, PLUGIN_ID, podcastSync } from "./plugin.ts";
import {
	decodeXmlEntities,
	DEFAULT_RSS_URL,
	fetchRssFeed,
	getEpisodeSlug,
	parseDuration,
	parseRssXml,
	redactRssUrlForDisplay,
	resolveRssUrl,
	validateRssUrl,
} from "./rss.ts";
import {
	channelDrift,
	episodeToFields,
	listExistingLegacyIds,
	normalizeUrlField,
	pubDateIso,
	syncPodcasts,
	type PodcastContentClient,
	type PodcastContentItem,
} from "./sync.ts";

function buildRssXml(opts: {
	channelTitle?: string;
	channelDescription?: string;
	channelImage?: string;
	items?: string[];
} = {}): string {
	const title = opts.channelTitle ?? PODCAST_CHANNEL.title;
	const description = opts.channelDescription ?? PODCAST_CHANNEL.description;
	const image = opts.channelImage ?? PODCAST_CHANNEL.image;
	const items = opts.items ?? [];
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">
  <channel>
    <title><![CDATA[${title}]]></title>
    <description><![CDATA[${description}]]></description>
    <link>${PODCAST_CHANNEL.link}</link>
    <image>
      <url>${image}</url>
      <title>${title}</title>
    </image>
    ${items.join("\n")}
  </channel>
</rss>`;
}

function buildItemXml(opts: {
	title?: string;
	link?: string;
	guid?: string;
	pubDate?: string;
	description?: string;
	duration?: string;
	audioUrl?: string;
	imageUrl?: string;
	useCdata?: boolean;
} = {}): string {
	const title = opts.title ?? "Episode 1";
	const desc = opts.description ?? "<p>Hello &amp; welcome</p>";
	const wrap = (v: string) => (opts.useCdata ? `<![CDATA[${v}]]>` : v);
	return `<item>
      <title>${wrap(title)}</title>
      ${opts.link !== undefined ? `<link>${opts.link}</link>` : ""}
      ${opts.guid !== undefined ? `<guid>${opts.guid}</guid>` : ""}
      ${opts.pubDate !== undefined ? `<pubDate>${opts.pubDate}</pubDate>` : ""}
      <description>${wrap(desc)}</description>
      ${opts.duration !== undefined ? `<itunes:duration>${opts.duration}</itunes:duration>` : ""}
      ${opts.audioUrl ? `<enclosure url="${opts.audioUrl}" length="12345" type="audio/mpeg"/>` : ""}
      ${opts.imageUrl ? `<itunes:image href="${opts.imageUrl}"/>` : ""}
    </item>`;
}

function createFakeContentClient(
	initialItems: PodcastContentItem[] = [],
	options: {
		pageSize?: number;
		onPublish?: (item: PodcastContentItem) => Promise<void> | void;
	} = {},
) {
	const items = initialItems.map((i) => ({ ...i, data: { ...i.data } }));
	let seq = initialItems.length;
	const pageSize = options.pageSize ?? 100;
	const createdPayloads: Array<Record<string, unknown>> = [];
	const publishedIds: string[] = [];

	const client: PodcastContentClient = {
		list: vi.fn(async (_collection, opts) => {
			const start = opts?.cursor ? Number(opts.cursor) : 0;
			const limit = Math.min(opts?.limit ?? 50, pageSize);
			const slice = items.slice(start, start + limit);
			const next = start + slice.length;
			const hasMore = next < items.length;
			return {
				items: slice,
				cursor: hasMore ? String(next) : undefined,
				hasMore,
			};
		}),
		create: vi.fn(async (_collection, data) => {
			if ("slug" in data) {
				throw new Error("unknown_field: slug");
			}
			createdPayloads.push(data);
			seq++;
			const created: PodcastContentItem = {
				id: `entry-${seq}`,
				slug: `auto-slug-${seq}`,
				status: "draft",
				data: { ...data },
			};
			items.push(created);
			return created;
		}),
		getVersioned: vi.fn(async (_collection, id) => {
			const found = items.find((i) => i.id === id);
			if (!found) return null;
			return { item: found, _rev: `rev-${id}` };
		}),
		publish: vi.fn(async (_collection, id, opts) => {
			const found = items.find((i) => i.id === id);
			if (!found) throw new Error(`Not found: ${id}`);
			if (opts._rev !== `rev-${id}`) throw new Error(`Stale _rev: ${opts._rev}`);
			found.status = "published";
			publishedIds.push(id);
			if (options.onPublish) await options.onPublish(found);
			return { item: found, _rev: `rev-${id}-pub` };
		}),
	};

	return { client, items, createdPayloads, publishedIds };
}

function createMockLogger(): Logger {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

afterEach(() => {
	clearSuppressedPublishDispatches();
	vi.restoreAllMocks();
});

describe("RSS XML parser & helpers", () => {
	it("decodes named, decimal, and hex XML entities in a single pass", () => {
		expect(decodeXmlEntities("A &amp; B &lt;tag&gt; &quot;hi&quot; &apos;ok&apos;")).toBe(`A & B <tag> "hi" 'ok'`);
		expect(decodeXmlEntities("it&#39;s &#x1F4FB;")).toBe("it's 📻");
		// Double-escaped must NOT be decoded twice
		expect(decodeXmlEntities("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
		// Invalid / surrogate codepoints left untouched
		expect(decodeXmlEntities("&#0; &#xD800; &#x999999;")).toBe("&#0; &#xD800; &#x999999;");
	});

	it("parses ISO PT... durations and preserves HH:MM:SS / MM:SS / seconds", () => {
		expect(parseDuration("PT1H2M3S")).toBe("1h 2m 3s");
		expect(parseDuration("PT45M")).toBe("45m");
		expect(parseDuration("PT30S")).toBe("30s");
		expect(parseDuration("01:02:03")).toBe("01:02:03");
		expect(parseDuration("42:10")).toBe("42:10");
		expect(parseDuration("1800")).toBe("1800");
		expect(parseDuration("   ")).toBe("");
	});

	it("extracts episode slugs from URLs with fallback", () => {
		expect(getEpisodeSlug("https://podcasters.spotify.com/pod/show/growgen/episodes/Ep-1---e2iv0jd")).toBe(
			"Ep-1---e2iv0jd",
		);
		expect(getEpisodeSlug("https://example.com/a/b/")).toBe("b");
		expect(getEpisodeSlug("https://example.com/")).toBe("unknown");
		expect(getEpisodeSlug("not-a-url")).toBe("unknown");
	});

	it("parses Anchor/Spotify RSS with CDATA, entities, HTML description, multiline tags, comments, BOM, and fallbacks", () => {
		const xml = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE rss [<!ENTITY fake "ignored">]>
<!-- Feed comment -->
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title><![CDATA[Show & <Live>]]></title>
    <description>Line 1 &amp; Line 2</description>
    <link>https://podcasters.spotify.com/pod/show/growgen</link>
    <itunes:image
      href="https://cdn.example.com/show.jpg?size=large&amp;v=1"
    />
    <item>
      <title><![CDATA[Ep 1: </item> &amp; raw CDATA]]></title>
      <link>https://podcasters.spotify.com/pod/show/growgen/episodes/ep-one--e1</link>
      <pubDate>Tue, 20 May 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>Hello <b>world</b>! ${"x".repeat(250)}</p>]]></description>
      <itunes:duration>PT1H15M30S</itunes:duration>
      <enclosure
        url="https://audio.example.com/ep1.mp3?a=1&amp;b=2"
        type="audio/mpeg"
      />
      <itunes:image href="https://cdn.example.com/ep1.jpg" />
    </item>
    <item>
      <title>Ep 2 &amp; Friends &#39;Live&#39;</title>
      <guid>https://anchor.fm/growgen/episodes/ep-two--e2</guid>
      <pubDate>Wed, 21 May 2025 12:30:00 GMT</pubDate>
      <description>&lt;p&gt;Escaped HTML&lt;/p&gt;</description>
      <itunes:duration>00:42:10</itunes:duration>
      <image><url>https://cdn.example.com/ep2-fallback.jpg</url></image>
    </item>
    <item>
      <!-- Missing title, link, pubDate, duration -->
    </item>
  </channel>
</rss>`;

		const feed = parseRssXml(xml);
		expect(feed.channel).toEqual({
			title: "Show & <Live>",
			description: "Line 1 & Line 2",
			link: "https://podcasters.spotify.com/pod/show/growgen",
			image: "https://cdn.example.com/show.jpg?size=large&v=1",
		});
		expect(feed.episodes).toHaveLength(3);

		expect(feed.episodes[0]).toMatchObject({
			id: "ep-one--e1",
			title: "Ep 1: </item> &amp; raw CDATA",
			link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-one--e1",
			pubDate: "Tue, 20 May 2025 10:00:00 GMT",
			duration: "1h 15m 30s",
			audioUrl: "https://audio.example.com/ep1.mp3?a=1&b=2",
			image: "https://cdn.example.com/ep1.jpg",
		});
		expect(feed.episodes[0]!.summary.length).toBeLessThanOrEqual(200);
		expect(feed.episodes[0]!.summary.startsWith("Hello world!")).toBe(true);

		expect(feed.episodes[1]).toMatchObject({
			id: "ep-two--e2",
			title: "Ep 2 & Friends 'Live'",
			link: "https://anchor.fm/growgen/episodes/ep-two--e2",
			description: "<p>Escaped HTML</p>",
			summary: "Escaped HTML",
			duration: "00:42:10",
			image: "https://cdn.example.com/ep2-fallback.jpg",
		});

		expect(feed.episodes[2]).toMatchObject({
			id: "ep-2",
			title: "Untitled",
			link: "",
			pubDate: "",
			description: "",
			summary: "",
			duration: "",
			audioUrl: "",
			image: "",
		});
	});

	it("falls back from empty <description></description> to <summary> / <itunes:summary>", () => {
		const xml = buildRssXml({
			items: [
				`<item>
					<title>Ep With Empty Desc</title>
					<link>https://podcasters.spotify.com/pod/show/growgen/episodes/ep-empty-desc</link>
					<pubDate>Thu, 04 Jan 2025 10:00:00 GMT</pubDate>
					<description>   </description>
					<itunes:summary>Fallback summary text</itunes:summary>
				</item>`,
			],
		});
		const feed = parseRssXml(xml);
		expect(feed.episodes[0]?.description).toBe("Fallback summary text");
		expect(feed.episodes[0]?.summary).toBe("Fallback summary text");
	});

	it("rejects malformed or non-RSS XML", () => {
		for (const bad of [
			"",
			"   ",
			"<html><body>not rss</body></html>",
			"<rss><notchannel/></rss>",
			"<rss><channel><title><![CDATA[unclosed</title></channel></rss>",
			"<rss><channel><title>mismatch</link></channel></rss>",
			"<rss><channel><item><title>unclosed</title></channel></rss>",
		]) {
			expect(() => parseRssXml(bad), bad).toThrow();
		}
	});
});

describe("SSRF & RSS URL validation and fetch errors", () => {
	it("defaults to Anchor RSS URL when PODCAST_RSS_URL is unset", () => {
		expect(resolveRssUrl({})).toEqual({ url: DEFAULT_RSS_URL, allowLocalHttp: false });
		expect(resolveRssUrl({ PODCAST_RSS_URL: "  " })).toEqual({ url: DEFAULT_RSS_URL, allowLocalHttp: false });
	});

	it("accepts https URLs and rejects http, non-http schemes, malformed URLs, credentials, private IPs, and internal hosts", () => {
		expect(validateRssUrl("https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
		for (const bad of [
			"",
			"not-a-url",
			"http://example.com/feed.xml",
			"http://127.0.0.1:8080/rss",
			"http://localhost:8080/rss",
			"file:///etc/passwd",
			"ftp://example.com/rss",
			"javascript:alert(1)",
			"https://user:pass@example.com/rss",
			"https://user@example.com/rss",
			// Private, loopback, link-local, metadata, and internal hosts over https:
			"https://127.0.0.1/rss",
			"https://127.0.0.2/rss",
			"https://169.254.169.254/latest/meta-data",
			"https://10.0.0.1/rss",
			"https://172.16.0.1/rss",
			"https://192.168.1.1/rss",
			"https://100.64.0.1/rss",
			"https://0.0.0.0/rss",
			"https://localhost/rss",
			"https://sub.localhost/rss",
			"https://metadata.google.internal/computeMetadata/v1/",
			"https://metadata.google/rss",
			"https://127.0.0.1.nip.io/rss",
			"https://[::1]/rss",
			"https://[fe80::1]/rss",
			"https://[fc00::1]/rss",
			"https://[::ffff:127.0.0.1]/rss",
			"https://[::ffff:169.254.169.254]/rss",
		]) {
			expect(() => validateRssUrl(bad), bad).toThrow();
		}
	});

	it("allows http loopback ONLY when SITE_ENV=local (and still rejects metadata/private IPs)", () => {
		expect(resolveRssUrl({ SITE_ENV: "local", PODCAST_RSS_URL: "http://127.0.0.1:9999/rss" })).toEqual({
			url: "http://127.0.0.1:9999/rss",
			allowLocalHttp: true,
		});
		expect(resolveRssUrl({ SITE_ENV: "local", PODCAST_RSS_URL: "http://localhost:9999/rss" })).toEqual({
			url: "http://localhost:9999/rss",
			allowLocalHttp: true,
		});
		// Non-loopback http and non-loopback private https are still rejected even when SITE_ENV=local
		expect(() => resolveRssUrl({ SITE_ENV: "local", PODCAST_RSS_URL: "http://example.com/rss" })).toThrow();
		expect(() => resolveRssUrl({ SITE_ENV: "local", PODCAST_RSS_URL: "https://169.254.169.254/rss" })).toThrow();
		expect(() => resolveRssUrl({ SITE_ENV: "local", PODCAST_RSS_URL: "https://10.0.0.1/rss" })).toThrow();
		// Production rejects loopback http and https
		expect(() => resolveRssUrl({ SITE_ENV: "production", PODCAST_RSS_URL: "http://127.0.0.1:9999/rss" })).toThrow();
		expect(() => resolveRssUrl({ SITE_ENV: "production", PODCAST_RSS_URL: "https://127.0.0.1:9999/rss" })).toThrow();
	});

	it("redacts query strings and hashes from displayed RSS URLs", () => {
		expect(redactRssUrlForDisplay("https://anchor.fm/s/f483db10/podcast/rss?secret=abc#frag")).toBe(
			"https://anchor.fm/s/f483db10/podcast/rss",
		);
	});

	it("handles non-2xx HTTP status, network failure, timeout, redirects, and oversized feeds", async () => {
		await expect(
			fetchRssFeed("https://example.com/rss", {
				fetchImpl: vi.fn(async () => new Response("nope", { status: 503 })) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/HTTP 503/);

		await expect(
			fetchRssFeed("https://example.com/rss", {
				fetchImpl: vi.fn(async () => {
					throw new Error("ECONNREFUSED");
				}) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/ECONNREFUSED/);

		await expect(
			fetchRssFeed("https://example.com/rss", {
				timeoutMs: 25,
				fetchImpl: vi.fn(
					(_url, init) =>
						new Promise<Response>((_resolve, reject) => {
							init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
						}),
				) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/timed out/i);

		// Mid-body streaming read timeout produces clean timeout error
		await expect(
			fetchRssFeed("https://example.com/rss", {
				timeoutMs: 25,
				fetchImpl: vi.fn(async (_url, init) => {
					const body = new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new TextEncoder().encode("<rss><channel>"));
							init?.signal?.addEventListener("abort", () => {
								controller.error(new DOMException("Aborted", "AbortError"));
							});
						},
					});
					return new Response(body, { status: 200 });
				}) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/timed out/i);

		// Redirect to unsafe http:// rejected
		await expect(
			fetchRssFeed("https://example.com/rss", {
				fetchImpl: vi.fn(
					async () =>
						new Response(null, {
							status: 302,
							headers: { Location: "http://internal.local/secret" },
						}),
				) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/https:/);

		// Redirect to https:// loopback or cloud metadata IP rejected
		for (const unsafeTarget of [
			"https://169.254.169.254/latest/meta-data",
			"https://127.0.0.1/admin",
			"https://10.0.0.5/internal",
			"https://localhost/rss",
			"https://[::ffff:169.254.169.254]/latest/meta-data",
		]) {
			await expect(
				fetchRssFeed("https://example.com/rss", {
					fetchImpl: vi.fn(
						async () =>
							new Response(null, {
								status: 302,
								headers: { Location: unsafeTarget },
							}),
					) as unknown as typeof fetch,
				}),
				unsafeTarget,
			).rejects.toThrow(/not allowed/);
		}

		// Valid https redirect followed
		let calls = 0;
		const validXml = buildRssXml({ items: [] });
		const feed = await fetchRssFeed("https://example.com/rss", {
			fetchImpl: vi.fn(async () => {
				calls++;
				if (calls === 1) {
					return new Response(null, { status: 302, headers: { Location: "https://cdn.example.com/rss.xml" } });
				}
				return new Response(validXml, { status: 200 });
			}) as unknown as typeof fetch,
		});
		expect(calls).toBe(2);
		expect(feed.channel.title).toBe(PODCAST_CHANNEL.title);

		// Oversized feed rejected
		await expect(
			fetchRssFeed("https://example.com/rss", {
				maxBytes: 64,
				fetchImpl: vi.fn(async () => new Response(validXml, { status: 200 })) as unknown as typeof fetch,
			}),
		).rejects.toThrow(/maximum allowed size/);
	});
});

describe("Idempotent sync, dry run, pubDate handling, and channel drift", () => {
	it("paginates through all pages and collects legacy_id across published, draft, and scheduled entries", async () => {
		const initial: PodcastContentItem[] = [
			{ id: "1", slug: "s1", status: "published", data: { legacy_id: "ep-1" } },
			{ id: "2", slug: "s2", status: "draft", data: { legacy_id: "ep-2" } },
			{ id: "3", slug: "s3", status: "scheduled", data: { legacy_id: "ep-3" } },
		];
		const { client } = createFakeContentClient(initial, { pageSize: 2 });
		const res = await listExistingLegacyIds(client);
		expect(client.list).toHaveBeenCalledTimes(2);
		expect(res.totalEntries).toBe(3);
		expect([...res.legacyIds]).toEqual(["ep-1", "ep-2", "ep-3"]);
	});

	it("dry run writes nothing and reports new, existing (including drafts), skipped, and drift warnings", async () => {
		const initial: PodcastContentItem[] = [
			{ id: "p1", slug: "ep-published", status: "published", data: { legacy_id: "ep-published", title: "Edited title" } },
			{ id: "p2", slug: "ep-draft", status: "draft", data: { legacy_id: "ep-draft", title: "Draft episode" } },
		];
		const { client } = createFakeContentClient(initial);
		const xml = buildRssXml({
			channelTitle: "Changed Show Title",
			items: [
				buildItemXml({
					title: "Published Episode (RSS)",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-published",
					pubDate: "Mon, 01 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "Draft Episode (RSS)",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-draft",
					pubDate: "Tue, 02 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "Brand New Episode",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-new",
					pubDate: "Wed, 03 Jan 2025 10:00:00 GMT",
					duration: "PT25M10S",
					audioUrl: "https://audio.example.com/new.mp3",
					imageUrl: "https://img.example.com/new.jpg",
				}),
				buildItemXml({
					title: "Broken Date Episode",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-bad-date",
					pubDate: "not-a-valid-date",
				}),
			],
		});

		const dispatchRebuild = vi.fn(async () => {});
		const result = await syncPodcasts({
			content: client,
			dryRun: true,
			fetchImpl: vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch,
			dispatchRebuild,
		});

		expect(result.mode).toBe("dry_run");
		expect(result.totalInFeed).toBe(4);
		expect(result.alreadyPresent).toBe(2);
		expect(result.created).toEqual([
			{ id: "ep-new", title: "Brand New Episode", pubDate: "2025-01-03T10:00:00.000Z" },
		]);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0]).toMatchObject({ id: "ep-bad-date", title: "Broken Date Episode" });
		expect(result.driftWarnings).toHaveLength(1);
		expect(result.driftWarnings[0]).toContain("RSS channel title differs");
		expect(result.rebuildDispatched).toBe(false);
		expect(client.create).not.toHaveBeenCalled();
		expect(client.publish).not.toHaveBeenCalled();
		expect(dispatchRebuild).not.toHaveBeenCalled();
	});

	it("creates and publishes only missing episodes, leaves existing published & draft untouched, and re-run is a no-op", async () => {
		const initial: PodcastContentItem[] = [
			{ id: "p1", slug: "ep-existing", status: "published", data: { legacy_id: "ep-existing", title: "Hand-edited" } },
			{ id: "p2", slug: "ep-draft", status: "draft", data: { legacy_id: "ep-draft", title: "Work in progress" } },
		];
		const { client, items, createdPayloads } = createFakeContentClient(initial);
		const xml = buildRssXml({
			items: [
				buildItemXml({
					title: "Existing in RSS",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-existing",
					pubDate: "Mon, 01 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "Draft in RSS",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-draft",
					pubDate: "Tue, 02 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "New Ep 1",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-new-1",
					pubDate: "Wed, 03 Jan 2025 10:00:00 GMT",
					duration: "00:35:00",
					audioUrl: "https://audio.example.com/1.mp3",
					imageUrl: "https://img.example.com/1.jpg",
				}),
				buildItemXml({
					title: "Bad Date",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-bad",
					pubDate: "definitely-not-a-date",
				}),
				buildItemXml({
					title: "Duplicate Ep 1",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-new-1",
					pubDate: "Thu, 04 Jan 2025 10:00:00 GMT",
				}),
			],
		});

		const fetchMock = vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
		const dispatchRebuild = vi.fn(async () => {});

		const first = await syncPodcasts({
			content: client,
			dryRun: false,
			fetchImpl: fetchMock,
			dispatchRebuild,
		});

		expect(first.mode).toBe("sync");
		expect(first.created).toHaveLength(1);
		expect(first.created[0]).toMatchObject({ id: "ep-new-1", title: "New Ep 1", entryId: "entry-3" });
		expect(first.alreadyPresent).toBe(2);
		expect(first.skipped).toHaveLength(2);
		expect(first.driftWarnings).toEqual([]);
		expect(first.rebuildDispatched).toBe(true);
		expect(dispatchRebuild).toHaveBeenCalledTimes(1);

		// Verify payload has no `slug` key and valid `pub_date`
		expect(createdPayloads).toHaveLength(1);
		expect(createdPayloads[0]).not.toHaveProperty("slug");
		expect(createdPayloads[0]).toMatchObject({
			title: "New Ep 1",
			legacy_id: "ep-new-1",
			pub_date: "2025-01-03T10:00:00.000Z",
			duration: "00:35:00",
			audio_url: "https://audio.example.com/1.mp3",
			image_url: "https://img.example.com/1.jpg",
		});

		// Existing published and draft entries untouched
		expect(items.find((i) => i.id === "p1")?.data.title).toBe("Hand-edited");
		expect(items.find((i) => i.id === "p2")?.status).toBe("draft");
		expect(items.find((i) => i.id === "entry-3")?.status).toBe("published");

		// Re-run is a complete no-op
		dispatchRebuild.mockClear();
		const second = await syncPodcasts({
			content: client,
			dryRun: false,
			fetchImpl: fetchMock,
			dispatchRebuild,
		});
		expect(second.created).toEqual([]);
		expect(second.alreadyPresent).toBe(4); // ep-existing, ep-draft, and both ep-new-1 entries
		expect(second.skipped).toHaveLength(1); // only ep-bad
		expect(second.rebuildDispatched).toBe(false);
		expect(dispatchRebuild).not.toHaveBeenCalled();
	});

	it("pubDateIso, normalizeUrlField & episodeToFields never emit pub_date: null or unsafe/non-URL values", () => {
		expect(pubDateIso({ pubDate: "" })).toBeUndefined();
		expect(pubDateIso({ pubDate: "invalid" })).toBeUndefined();
		expect(pubDateIso({ pubDate: "Wed, 03 Jan 2025 10:00:00 GMT" })).toBe("2025-01-03T10:00:00.000Z");

		expect(normalizeUrlField("https://example.com/ep")).toBe("https://example.com/ep");
		expect(normalizeUrlField("http://example.com/ep")).toBe("http://example.com/ep");
		for (const bad of ["", "  ", "urn:uuid:1234", "not-a-url", "javascript:alert(1)", "data:text/html,x", "https://example.com/\nfoo"]) {
			expect(normalizeUrlField(bad), bad).toBeNull();
		}

		const fields = episodeToFields({
			id: "ep-x",
			title: "T",
			link: "urn:uuid:non-permalink-guid",
			pubDate: "bad",
			description: "",
			summary: "",
			duration: "",
			audioUrl: "javascript:alert(1)",
			image: "not a valid url",
		});
		expect("pub_date" in fields).toBe(false);
		expect("slug" in fields).toBe(false);
		expect(fields.link).toBeNull();
		expect(fields.audio_url).toBeNull();
		expect(fields.image_url).toBeNull();
	});

	it("detects channel drift cleanly against apps/web/src/lib/podcast-channel.ts", () => {
		expect(channelDrift(PODCAST_CHANNEL)).toEqual([]);
		const warnings = channelDrift({
			title: "Different",
			description: PODCAST_CHANNEL.description,
			image: "https://example.com/other.jpg",
		});
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("title");
		expect(warnings[1]).toContain("image");
	});
});

describe("Multi-episode rebuild dispatch coalescing", () => {
	it("triggers exactly ONE GitHub repository_dispatch when syncing 3 episodes even as deferred afterPublish hooks fire", async () => {
		const env = {
			SITE_ENV: "production",
			GITHUB_DISPATCH_TOKEN: "ghp_canary_token_value",
			GITHUB_DISPATCH_REPO: "gongbaodd/blog.gongbushang.com",
		} as unknown as NodeJS.ProcessEnv;

		const log = createMockLogger();
		const githubCalls: Array<{ url: string; body: unknown }> = [];
		const xml = buildRssXml({
			items: [
				buildItemXml({
					title: "Ep A",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-a",
					pubDate: "Mon, 01 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "Ep B",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-b",
					pubDate: "Tue, 02 Jan 2025 10:00:00 GMT",
				}),
				buildItemXml({
					title: "Ep C",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-c",
					pubDate: "Wed, 03 Jan 2025 10:00:00 GMT",
				}),
			],
		});

		const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url.includes("/dispatches")) {
				githubCalls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
				return new Response(null, { status: 204 });
			}
			return new Response(xml, { status: 200 });
		}) as unknown as typeof fetch;

		const rebuildPlugin = createRebuildPlugin({ env, fetchImpl: fetchMock });
		const deferredAfterPublish: Array<() => Promise<void>> = [];

		const { client } = createFakeContentClient([], {
			onPublish: (item) => {
				// Simulate EmDash deferring `content:afterPublish` via `after(...)` until after the route handler finishes
				deferredAfterPublish.push(async () => {
					await rebuildPlugin.hooks["content:afterPublish"]?.handler(
						{ collection: "podcasts", content: { id: item.id, slug: item.slug } } as never,
						{ log } as never,
					);
				});
			},
		});

		const res = await syncPodcasts({
			content: client,
			dryRun: false,
			env,
			fetchImpl: fetchMock,
			log,
			dispatchRebuild: dispatchFromNodeEnv,
		});

		expect(res.created).toHaveLength(3);
		expect(githubCalls).toHaveLength(1);

		// Now run all 3 deferred content:afterPublish hooks (as EmDash's `after(...)` would)
		for (const runHook of deferredAfterPublish) {
			await runHook();
		}

		// Still exactly 1 dispatch total!
		expect(githubCalls).toHaveLength(1);
		expect(githubCalls[0]!.url).toBe("https://api.github.com/repos/gongbaodd/blog.gongbushang.com/dispatches");

		// An unrelated publish afterwards is NOT suppressed
		await rebuildPlugin.hooks["content:afterPublish"]?.handler(
			{ collection: "posts", content: { id: "post-99", slug: "manual-post" } } as never,
			{ log } as never,
		);
		expect(githubCalls).toHaveLength(2);
	});

	it("clears the suppression marker if publish throws so a later manual publish of that draft still dispatches", async () => {
		const env = {
			SITE_ENV: "production",
			GITHUB_DISPATCH_TOKEN: "ghp_canary_token_value",
			GITHUB_DISPATCH_REPO: "gongbaodd/blog.gongbushang.com",
		} as unknown as NodeJS.ProcessEnv;

		const log = createMockLogger();
		const githubCalls: string[] = [];
		const xml = buildRssXml({
			items: [
				buildItemXml({
					title: "Failing Publish Ep",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-fail",
					pubDate: "Mon, 01 Jan 2025 10:00:00 GMT",
				}),
			],
		});

		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
			if (url.includes("/dispatches")) {
				githubCalls.push(url);
				return new Response(null, { status: 204 });
			}
			return new Response(xml, { status: 200 });
		}) as unknown as typeof fetch;

		const { client } = createFakeContentClient([], {
			onPublish: () => {
				throw new Error("DB publish error");
			},
		});

		await expect(
			syncPodcasts({
				content: client,
				dryRun: false,
				env,
				fetchImpl: fetchMock,
				log,
				dispatchRebuild: dispatchFromNodeEnv,
			}),
		).rejects.toThrow("DB publish error");

		// No batch rebuild was dispatched because 0 episodes finished publishing
		expect(githubCalls).toHaveLength(0);

		// A subsequent manual publish of that exact draft ("entry-1") MUST NOT be suppressed
		const rebuildPlugin = createRebuildPlugin({ env, fetchImpl: fetchMock });
		await rebuildPlugin.hooks["content:afterPublish"]?.handler(
			{ collection: "podcasts", content: { id: "entry-1", slug: "auto-slug-1" } } as never,
			{ log } as never,
		);
		expect(githubCalls).toHaveLength(1);
	});
});

describe("Plugin registration, Block Kit rendering, concurrency guard, and secret non-leakage", () => {
	function collectButtons(res: BlockResponse) {
		const buttons: Array<{ action_id?: string; label?: string }> = [];
		const links: Array<{ action_id?: string; target?: unknown }> = [];
		const walk = (n: unknown) => {
			if (Array.isArray(n)) n.forEach(walk);
			else if (n && typeof n === "object") {
				const rec = n as Record<string, unknown>;
				if (rec.type === "button") buttons.push(rec as never);
				if (rec.type === "link") links.push(rec as never);
				Object.values(rec).forEach(walk);
			}
		};
		walk(res);
		return { buttons, links };
	}

	it("declares a valid native PluginDescriptor with page, widget, and required capabilities", () => {
		const desc = podcastSync();
		expect(desc.id).toBe(PLUGIN_ID);
		expect(desc.format).toBe("native");
		expect(desc.adminPages).toEqual([{ path: PODCAST_SYNC_PAGE_PATH, label: "Podcast sync", icon: "radio" }]);
		expect(desc.adminWidgets).toEqual([{ id: "podcast-sync", title: "Podcast sync", size: "half" }]);

		const plugin = createPlugin();
		expect(plugin.id).toBe(PLUGIN_ID);
		expect(plugin.capabilities).toEqual(["content:read", "content:write", "content:publish"]);
		expect(plugin.admin.pages).toEqual(desc.adminPages);
		expect(plugin.admin.widgets).toEqual(desc.adminWidgets);
		expect(plugin.routes.admin).toBeDefined();
	});

	it("renders idle state and handles dry-run & sync actions on both page and widget", async () => {
		const xml = buildRssXml({
			items: [
				buildItemXml({
					title: "Fresh Episode",
					link: "https://podcasters.spotify.com/pod/show/growgen/episodes/ep-fresh",
					pubDate: "Thu, 04 Jan 2025 10:00:00 GMT",
				}),
			],
		});
		const { client } = createFakeContentClient([]);
		const log = createMockLogger();
		const fetchMock = vi.fn(async () => new Response(xml, { status: 200 })) as unknown as typeof fetch;
		const handler = createAdminRouteHandler({
			env: { SITE_ENV: "local" },
			fetchImpl: fetchMock,
			now: () => new Date("2025-01-05T00:00:00Z"),
		});

		// Page idle load
		const pageIdle = await handler({
			input: { type: "page_load", page: PODCAST_SYNC_PAGE_PATH },
			content: client,
			log,
		});
		expect(pageIdle.blocks[0]).toMatchObject({ type: "header", text: "Spotify Podcast Sync" });
		const pageIdleControls = collectButtons(pageIdle);
		expect(pageIdleControls.buttons.map((b) => b.action_id)).toEqual([ACTION_CHECK_RSS, ACTION_RUN_SYNC]);
		for (const l of pageIdleControls.links) expect(l.action_id).toBeUndefined();

		// Widget idle load
		const widgetIdle = await handler({
			input: { type: "page_load", page: "widget:podcast-sync" },
			content: client,
			log,
			ui: { surface: "dashboard-widget" },
		});
		expect(widgetIdle.blocks[0]).toMatchObject({ type: "context" });
		const widgetControls = collectButtons(widgetIdle);
		expect(widgetControls.buttons.map((b) => b.action_id)).toEqual([ACTION_CHECK_RSS, ACTION_RUN_SYNC]);
		expect(widgetControls.links).toEqual([
			expect.objectContaining({
				type: "link",
				target: { kind: "plugin-page", path: PODCAST_SYNC_PAGE_PATH },
			}),
		]);

		// Dry run from widget (never accepts client-provided URL in input.value!)
		const dryRes = await handler({
			input: {
				type: "block_action",
				action_id: ACTION_CHECK_RSS,
				page: "widget:podcast-sync",
				value: { url: "http://169.254.169.254/latest/meta-data" },
			},
			content: client,
			log,
		});
		expect(fetchMock).toHaveBeenCalledWith(DEFAULT_RSS_URL, expect.any(Object));
		expect(JSON.stringify(dryRes.blocks)).toContain("Dry run: 1 new episode ready to import");
		expect(JSON.stringify(dryRes.blocks)).toContain("Fresh Episode");
		expect(client.create).not.toHaveBeenCalled();

		// Sync from page
		const syncRes = await handler({
			input: {
				type: "block_action",
				action_id: ACTION_RUN_SYNC,
				page: PODCAST_SYNC_PAGE_PATH,
			},
			content: client,
			log,
		});
		expect(JSON.stringify(syncRes.blocks)).toContain("Synced 1 new episode");
		expect(JSON.stringify(syncRes.blocks)).toContain("Fresh Episode");
		expect(syncRes.toast).toEqual({ message: "Synced 1 new episode", type: "success" });
		// Edit link points to podcasts collection entry
		const syncControls = collectButtons(syncRes);
		expect(syncControls.links).toContainEqual(
			expect.objectContaining({
				type: "link",
				target: { kind: "content", collection: "podcasts", id: "entry-1" },
			}),
		);
	});

	it("prevents concurrent sync runs with a clear busy alert banner", async () => {
		let releaseFetch!: () => void;
		const fetchPromise = new Promise<Response>((resolve) => {
			releaseFetch = () => resolve(new Response(buildRssXml({ items: [] }), { status: 200 }));
		});
		const { client } = createFakeContentClient([]);
		const log = createMockLogger();
		const handler = createAdminRouteHandler({
			env: { SITE_ENV: "local" },
			fetchImpl: vi.fn(() => fetchPromise) as unknown as typeof fetch,
		});

		const firstCall = handler({
			input: { type: "block_action", action_id: ACTION_RUN_SYNC, page: PODCAST_SYNC_PAGE_PATH },
			content: client,
			log,
		});

		// Second click while first is still awaiting RSS fetch
		const secondRes = await handler({
			input: { type: "block_action", action_id: ACTION_RUN_SYNC, page: PODCAST_SYNC_PAGE_PATH },
			content: client,
			log,
		});
		expect(secondRes.blocks[0]).toMatchObject({ type: "banner", variant: "alert" });
		expect(JSON.stringify(secondRes.blocks)).toContain("already running");

		releaseFetch();
		const firstRes = await firstCall;
		expect(JSON.stringify(firstRes.blocks)).toContain("Already up to date");
	});

	it("renders clean error banners and never leaks environment secrets or connection strings", async () => {
		const CANARY = "canary-secret-9e8d7c6b";
		const secretEnv = {
			SITE_ENV: "production",
			DATABASE_URL: `postgresql://postgres:${CANARY}@db.example.invalid:5432/postgres`,
			GITHUB_DISPATCH_TOKEN: CANARY,
			SUPABASE_SERVICE_ROLE_KEY: CANARY,
			PODCAST_RSS_URL: `https://anchor.fm/s/f483db10/podcast/rss?token=${CANARY}`,
		} as unknown as NodeJS.ProcessEnv;

		const { client } = createFakeContentClient([]);
		const log = createMockLogger();
		const failingHandler = createAdminRouteHandler({
			env: secretEnv,
			fetchImpl: vi.fn(async () => {
				throw new Error(`connect failed postgresql://u:${CANARY}@h/db https://u:${CANARY}@host/path`);
			}) as unknown as typeof fetch,
		});

		for (const page of [PODCAST_SYNC_PAGE_PATH, "widget:podcast-sync"]) {
			const idle = await failingHandler({ input: { type: "page_load", page }, content: client, log });
			const errRes = await failingHandler({
				input: { type: "block_action", action_id: ACTION_CHECK_RSS, page },
				content: client,
				log,
			});

			for (const out of [JSON.stringify(idle), JSON.stringify(errRes)]) {
				expect(out).not.toContain(CANARY);
				expect(out).not.toMatch(/postgres(?:ql)?:\/\//i);
			}
			expect(errRes.blocks).toContainEqual(
				expect.objectContaining({ type: "banner", variant: "error", title: "Podcast sync failed" }),
			);
		}

		expect(sanitizeErrorMessage(new Error("postgresql://user:pw@host:5432/db\nstack line"))).toBe(
			"[redacted-db-url]",
		);
	});
});
