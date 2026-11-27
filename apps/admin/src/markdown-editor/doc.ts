/**
 * Pure helpers around the CodeMirror document for `body_md` (GON-249). No DOM, so they run under vitest in Node.
 *
 * Byte-identity contract: `readBody(createBodyState(value)) === value` for every string. Two choices make that hold:
 *   1. `EditorState.lineSeparator` is set explicitly. CodeMirror otherwise splits on /\r\n?|\n/ and rejoins with "\n", which would
 *      rewrite the 21 CRLF posts (and any lone CR). With an explicit separator, CodeMirror splits on exactly that string and
 *      `sliceDoc` rejoins with it, so any choice is lossless. A pure-CRLF body gets "\r\n", so Enter inserts "\r\n" and the endings
 *      stay uniform; every other body gets "\n", and a stray "\r" stays an ordinary character at the end of its line.
 *   2. The widget calls `onChange` only for user transactions, never for the initial document or an external value sync.
 * A BOM, trailing whitespace and a missing final newline need no handling: they are plain characters of the string.
 */
import { EditorSelection, EditorState, Transaction, type Extension, type TransactionSpec } from "@codemirror/state";

/** Everything CodeMirror shows as a red dot by default, except "\r": CRLF posts must not look broken. Tab is not listed either. */
export const BODY_SPECIAL_CHARS = new RegExp(
	"[\\u0000-\\u0008\\u000a-\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u00ad\\u061c\\u200b\\u200e\\u200f\\u2028\\u2029\\u202d\\u202e\\u2066\\u2067\\u2069\\ufeff\\ufff9-\\ufffc]",
	// CodeMirror's MatchDecorator throws on a pattern without the global flag.
	"g",
);

/** Marks transactions that sync an outside value into the editor, so they are not echoed back through `onChange`. */
export const externalSync = Transaction.userEvent.of("emdash.external-sync");

/** "\r\n" when every line break in `value` is CRLF (and there is at least one), else "\n". */
export function bodyLineSeparator(value: string): "\n" | "\r\n" {
	return value.includes("\r\n") && !/\r(?!\n)|(?<!\r)\n/.test(value) ? "\r\n" : "\n";
}

export function createBodyState(value: string, extensions: Extension[] = []): EditorState {
	return EditorState.create({ doc: value, extensions: [EditorState.lineSeparator.of(bodyLineSeparator(value)), ...extensions] });
}

/** `sliceDoc` joins lines with `state.lineBreak` (the separator above); `doc.toString()` would always use "\n". */
export function readBody(state: EditorState): string {
	return state.sliceDoc();
}

/** Transaction replacing the whole document with an outside value (the host re-rendered with a different `value`). */
export function replaceBodySpec(state: EditorState, value: string): TransactionSpec {
	return { changes: { from: 0, to: state.doc.length, insert: value }, annotations: externalSync };
}

export function isExternalSync(tr: Transaction): boolean {
	return tr.isUserEvent("emdash.external-sync");
}

/** True when a host `value` must be pushed into the editor: only when it differs from what the editor already holds. */
export function needsExternalSync(state: EditorState, value: string): boolean {
	return readBody(state) !== value;
}

/** Wrap the selection (or insert a placeholder) in `before`/`after`; toggles off when the selection is already wrapped. */
export function wrapSelectionSpec(state: EditorState, before: string, after: string = before, placeholder = ""): TransactionSpec {
	return state.changeByRange((range) => {
		const { from, to } = range;
		const outerFrom = from - before.length;
		const outerTo = to + after.length;
		if (outerFrom >= 0 && outerTo <= state.doc.length && state.sliceDoc(outerFrom, from) === before && state.sliceDoc(to, outerTo) === after) {
			return {
				changes: [
					{ from: outerFrom, to: from },
					{ from: to, to: outerTo },
				],
				range: EditorSelection.range(outerFrom, outerFrom + (to - from)),
			};
		}
		const inner = state.sliceDoc(from, to) || placeholder;
		return {
			changes: { from, to, insert: `${before}${inner}${after}` },
			range: EditorSelection.range(from + before.length, from + before.length + inner.length),
		};
	});
}

/** Markdown for an inserted image. `alt` square brackets are escaped so the syntax stays valid. */
export function imageMarkdown(alt: string, url: string): string {
	const safeAlt = alt.replace(/[\[\]]/g, "\\$&").replace(/\s+/g, " ").trim();
	const safeUrl = /[\s()<>]/.test(url) ? `<${url.replace(/>/g, "%3E")}>` : url;
	return `![${safeAlt}](${safeUrl})`;
}

/** Insert text at the main selection head (replacing the selection) and put the cursor after it. */
export function insertAtSelectionSpec(state: EditorState, text: string): TransactionSpec {
	const { from, to } = state.selection.main;
	return { changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true };
}
