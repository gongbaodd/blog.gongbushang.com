import { EditorSelection } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { insertNewline } from "@codemirror/commands";
import {
	BODY_SPECIAL_CHARS,
	bodyLineSeparator,
	createBodyState,
	imageMarkdown,
	insertAtSelectionSpec,
	isExternalSync,
	needsExternalSync,
	readBody,
	replaceBodySpec,
	wrapSelectionSpec,
} from "./doc.ts";

/** Edge cases seen in (or possible for) the 996 stored bodies. */
export const EDGE_CASES: Record<string, string> = {
	empty: "",
	"only newline": "\n",
	"no trailing newline": "# Title\n\nText",
	"one trailing newline": "Text\n",
	"two trailing newlines": "Text\n\n",
	crlf: "line one\r\nline two\r\n\r\nline four\r\n",
	"crlf without final newline": "a\r\nb",
	"mixed endings": "a\r\nb\nc\r\nd\n",
	"lone cr": "a\rb\rc",
	"trailing cr": "text\r",
	"cr before eof newline": "text\r\n",
	bom: "﻿# Title\n",
	"trailing whitespace": "text  \nhard break  \n\t\nlast \t",
	"whitespace only lines": "   \n\t\n \n",
	tabs: "\tindented\n\t\tmore\n",
	"unicode and emoji": "中文 😀 é   nbsp\n",
	"line and paragraph separators": "a b c\n",
	"zero width": "a​b‎c\n",
	"nul and controls": "a\u0000b\u0007c\u001fd",
	"fenced code": "```js\nconst a = 1;  \n```\n",
	"mdx component": 'import X from "@/packages/image/DescriptionImage";\r\n\r\n<DescriptionImage src="a" alt="b">\r\n  text\r\n</DescriptionImage>\r\n',
	"huge line": "x".repeat(200_000) + "\n",
	"many lines": Array.from({ length: 20_000 }, (_, i) => `line ${i}`).join("\n"),
};

describe("body byte round trip (open and save without edits)", () => {
	for (const [name, value] of Object.entries(EDGE_CASES)) {
		it(`keeps ${name} byte-identical`, () => {
			const state = createBodyState(value);
			expect(readBody(state)).toBe(value);
			expect(needsExternalSync(state, value)).toBe(false);
		});
	}

	it("picks CRLF only for bodies whose every line break is CRLF", () => {
		expect(bodyLineSeparator("a\r\nb\r\n")).toBe("\r\n");
		expect(bodyLineSeparator("a\r\nb")).toBe("\r\n");
		expect(bodyLineSeparator("a\r\nb\n")).toBe("\n");
		expect(bodyLineSeparator("a\r\nb\rc")).toBe("\n");
		expect(bodyLineSeparator("a\nb")).toBe("\n");
		expect(bodyLineSeparator("")).toBe("\n");
	});

	it("Enter in a CRLF body inserts CRLF; in an LF body inserts LF", () => {
		for (const [value, expected] of [
			["alpha\r\nbeta\r\n", "alpha\r\n\r\nbeta\r\n"],
			["alpha\nbeta\n", "alpha\n\nbeta\n"],
		] as const) {
			let state = createBodyState(value);
			state = state.update({ selection: { anchor: 5 } }).state;
			insertNewline({ state, dispatch: (tr) => (state = tr.state) });
			expect(readBody(state)).toBe(expected);
		}
	});

	it("keeps a CRLF body identical after an edit that does not touch the line endings", () => {
		const value = "alpha\r\nbeta\r\ngamma\r\n";
		const state = createBodyState(value);
		const edited = state.update({ changes: { from: 5, insert: "!" } }).state;
		expect(readBody(edited)).toBe("alpha!\r\nbeta\r\ngamma\r\n");
	});

	it("an edit and its inverse restore the exact original", () => {
		const value = "﻿a  \r\nb\r\n";
		const state = createBodyState(value);
		const edited = state.update({ changes: { from: 2, to: 4, insert: "" } }).state;
		const restored = edited.update({ changes: { from: 2, insert: "  " } }).state;
		expect(readBody(restored)).toBe(value);
	});

	it("treats CRLF as one line break in a pure-CRLF body", () => {
		const state = createBodyState("a\r\nb\r\nc");
		expect(state.doc.lines).toBe(3);
		expect(state.doc.line(1).text).toBe("a");
	});

	it("keeps a stray CR as a character in a mixed body (one line per LF)", () => {
		const state = createBodyState("a\r\nb\nc");
		expect(state.doc.lines).toBe(3);
		expect(state.doc.line(1).text).toBe("a\r");
	});

	it("stays lossless when the host syncs an LF value into a CRLF editor", () => {
		const state = createBodyState("a\r\nb\r\n");
		const next = state.update(replaceBodySpec(state, "x\ny\r\nz")).state;
		expect(readBody(next)).toBe("x\ny\r\nz");
	});
});

describe("external value sync", () => {
	it("is not needed when the host echoes the editor's own value", () => {
		const state = createBodyState("same\r\n");
		expect(needsExternalSync(state, "same\r\n")).toBe(false);
	});

	it("replaces the document and is flagged so it is not reported through onChange", () => {
		const state = createBodyState("old");
		const tr = state.update(replaceBodySpec(state, "new\r\ntext"));
		expect(readBody(tr.state)).toBe("new\r\ntext");
		expect(isExternalSync(tr)).toBe(true);
		expect(isExternalSync(state.update({ changes: { from: 0, insert: "x" } }))).toBe(false);
	});
});

describe("toolbar helpers", () => {
	it("wraps a selection in bold and unwraps it again", () => {
		const state = createBodyState("hello world", [], ).update({ selection: EditorSelection.range(0, 5) }).state;
		const wrapped = state.update(wrapSelectionSpec(state, "**")).state;
		expect(readBody(wrapped)).toBe("**hello** world");
		const unwrapped = wrapped.update(wrapSelectionSpec(wrapped, "**")).state;
		expect(readBody(unwrapped)).toBe("hello world");
	});

	it("inserts a placeholder when nothing is selected", () => {
		const state = createBodyState("");
		const next = state.update(wrapSelectionSpec(state, "[", "](https://)", "link text")).state;
		expect(readBody(next)).toBe("[link text](https://)");
		expect(next.selection.main.from).toBe(1);
		expect(next.selection.main.to).toBe(10);
	});

	it("formats an image with escaped alt text and a safe url", () => {
		expect(imageMarkdown("a [b]\nc", "https://res.cloudinary.com/x/image/upload/v1/a.jpg")).toBe(
			"![a \\[b\\] c](https://res.cloudinary.com/x/image/upload/v1/a.jpg)",
		);
		expect(imageMarkdown("x", "https://e.com/a b(1).png")).toBe("![x](<https://e.com/a b(1).png>)");
	});

	it("inserts text at the cursor and leaves the cursor after it", () => {
		const state = createBodyState("ab").update({ selection: { anchor: 1 } }).state;
		const next = state.update(insertAtSelectionSpec(state, "![i](u)")).state;
		expect(readBody(next)).toBe("a![i](u)b");
		expect(next.selection.main.head).toBe(8);
	});
});

describe("special characters pattern", () => {
	it("has the global flag CodeMirror's MatchDecorator requires", () => {
		expect(BODY_SPECIAL_CHARS.flags).toContain("g");
	});

	it("does not flag CR or tab, but flags a zero-width space", () => {
		expect("\r\t".match(BODY_SPECIAL_CHARS)).toBeNull();
		expect("a\u200bb".match(BODY_SPECIAL_CHARS)).toEqual(["\u200b"]);
	});
});
