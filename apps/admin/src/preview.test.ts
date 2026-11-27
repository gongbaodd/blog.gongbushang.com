import { generatePreviewToken, parseContentId, verifyPreviewToken } from "emdash";
import { describe, expect, it } from "vitest";
import { isPreviewGranted, markdownToHtml } from "./preview.ts";

const secret = "test-preview-secret";
const url = (token: string) => new URL(`https://admin.example/posts/hello?_preview=${token}`);

describe("preview token (emdash verifyPreviewToken)", () => {
	it("accepts a token for posts:abc and maps it to a grant for that entry", async () => {
		const token = await generatePreviewToken({ contentId: "posts:abc", secret });
		const res = await verifyPreviewToken({ url: url(token), secret });
		expect(res.valid).toBe(true);
		if (!res.valid) return;
		const granted = parseContentId(res.payload.cid);
		expect(isPreviewGranted(granted, "posts", "abc")).toBe(true);
		expect(isPreviewGranted(granted, "posts", "other")).toBe(false);
		expect(isPreviewGranted(granted, "podcasts", "abc")).toBe(false);
	});

	it("rejects a token signed with another secret, a malformed token and a missing token", async () => {
		const token = await generatePreviewToken({ contentId: "posts:abc", secret: "other" });
		expect((await verifyPreviewToken({ url: url(token), secret })).valid).toBe(false);
		expect((await verifyPreviewToken({ url: url("garbage"), secret })).valid).toBe(false);
		expect((await verifyPreviewToken({ url: new URL("https://admin.example/posts/x"), secret })).valid).toBe(false);
	});

	it("rejects an expired token", async () => {
		const token = await generatePreviewToken({ contentId: "posts:abc", secret, expiresIn: -60 });
		expect((await verifyPreviewToken({ url: url(token), secret })).valid).toBe(false);
	});
});

describe("isPreviewGranted", () => {
	it("denies when there is no grant or no entry id", () => {
		expect(isPreviewGranted(undefined, "posts", "abc")).toBe(false);
		expect(isPreviewGranted({ collection: "posts", id: "abc" }, "posts", undefined)).toBe(false);
	});
});

describe("markdownToHtml", () => {
	it("renders markdown", async () => {
		expect(await markdownToHtml("# Hi\n\n**bold**")).toContain("<strong>bold</strong>");
	});
});
