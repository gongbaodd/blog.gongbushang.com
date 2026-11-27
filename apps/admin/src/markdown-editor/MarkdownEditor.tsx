/**
 * `body_md` field widget (GON-249): CodeMirror 6 on the raw Markdown string, a sandboxed split preview, and image insert through the
 * EmDash media library (`MediaPickerModal`, Cloudinary provider). The stored value stays the exact string the author sees; see ./doc.ts
 * for the byte-identity contract.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, highlightSpecialChars, keymap, placeholder } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { MediaPickerModal, type MediaItem } from "@emdash-cms/admin";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
	BODY_SPECIAL_CHARS,
	createBodyState,
	imageMarkdown,
	insertAtSelectionSpec,
	isExternalSync,
	needsExternalSync,
	readBody,
	replaceBodySpec,
	wrapSelectionSpec,
} from "./doc.ts";
import "./markdown-editor.css";

/** Props EmDash 1.6 passes to a plugin field widget (`resolvePluginFieldWidget`). */
export interface FieldWidgetProps {
	value: unknown;
	onChange: (value: string) => void;
	label: string;
	id: string;
	required?: boolean;
	options?: Record<string, unknown>;
	validation?: Record<string, unknown>;
	minimal?: boolean;
}

const markdownHighlight = HighlightStyle.define([
	{ tag: t.heading, fontWeight: "700" },
	{ tag: t.strong, fontWeight: "700" },
	{ tag: t.emphasis, fontStyle: "italic" },
	{ tag: t.strikethrough, textDecoration: "line-through" },
	{ tag: t.link, textDecoration: "underline" },
	{ tag: t.url, opacity: "0.7" },
	{ tag: t.monospace, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
	{ tag: [t.processingInstruction, t.contentSeparator, t.quote], opacity: "0.65" },
]);

function baseExtensions(label: string, onUserChange: (value: string) => void, minRows: number): Extension[] {
	return [
		history(),
		highlightSpecialChars({ specialChars: BODY_SPECIAL_CHARS }),
		markdown(),
		syntaxHighlighting(markdownHighlight),
		EditorView.lineWrapping,
		placeholder("Write Markdown…"),
		keymap.of([
			{ key: "Mod-b", run: (v) => (v.dispatch(wrapSelectionSpec(v.state, "**", "**", "bold")), true) },
			{ key: "Mod-i", run: (v) => (v.dispatch(wrapSelectionSpec(v.state, "*", "*", "italic")), true) },
			{ key: "Mod-e", run: (v) => (v.dispatch(wrapSelectionSpec(v.state, "`", "`", "code")), true) },
			{ key: "Mod-k", run: (v) => (v.dispatch(wrapSelectionSpec(v.state, "[", "](https://)", "link text")), true) },
			indentWithTab,
			...defaultKeymap,
			...historyKeymap,
		]),
		EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "true" }),
		EditorView.theme({
			"&": { minHeight: `${minRows * 1.6}em`, maxHeight: "75vh", backgroundColor: "transparent", color: "inherit" },
			".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.875rem", lineHeight: "1.6" },
			".cm-content": { caretColor: "currentColor", padding: "12px 0" },
			"&.cm-focused": { outline: "2px solid color-mix(in srgb, currentColor 35%, transparent)" },
			".cm-cursor": { borderLeftColor: "currentColor" },
			".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, #3b82f6 30%, transparent)" },
		}),
		EditorView.updateListener.of((update) => {
			if (!update.docChanged || update.transactions.every(isExternalSync)) return;
			onUserChange(readBody(update.state));
		}),
	];
}

export function MarkdownEditorWidget({ value, onChange, label, id, required, options }: FieldWidgetProps) {
	const text = typeof value === "string" ? value : "";
	const host = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [showPreview, setShowPreview] = useState(true);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [previewBody, setPreviewBody] = useState(text);
	const [previewDoc, setPreviewDoc] = useState<string | null>(null);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [fullScreen, setFullScreen] = useState(false);
	const [fullScreenColors, setFullScreenColors] = useState<{ background: string; color: string }>();
	// The widget renders into `portalRoot`, which sits in `slot` inline and moves to <body> in full screen. The admin nests its
	// content in `isolation: isolate` wrappers, so a fixed overlay left in place would stay under the header and sidebar. Moving the
	// container (not re-rendering into a new one) keeps the CodeMirror view, its history and selection.
	const slot = useRef<HTMLDivElement>(null);
	const [portalRoot] = useState(() => document.createElement("div"));
	// In full screen the container goes right after the admin's app root, not at the end of <body>: it then paints above the app
	// but below the dialogs, popovers and toasts the admin portals to the end of <body> (the media picker among them).
	useLayoutEffect(() => {
		const inline = slot.current;
		if (!inline) return;
		if (!fullScreen) {
			if (portalRoot.parentNode !== inline) inline.appendChild(portalRoot);
			return;
		}
		let appRoot: Element = inline;
		while (appRoot.parentElement && appRoot.parentElement !== document.body) appRoot = appRoot.parentElement;
		document.body.insertBefore(portalRoot, appRoot.parentElement === document.body ? appRoot.nextSibling : document.body.firstChild);
	}, [fullScreen, portalRoot]);
	useEffect(() => () => portalRoot.remove(), [portalRoot]);

	const rows = typeof options?.rows === "number" ? options.rows : 30;

	// Create the editor once. The initial document is `text` and no change is reported for it.
	useEffect(() => {
		const parent = host.current;
		if (!parent) return;
		const view = new EditorView({
			parent,
			state: createBodyState(text, baseExtensions(label, (next) => {
				onChangeRef.current(next);
				setPreviewBody(next);
			}, Math.min(rows, 30))),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps -- the view owns its document after mount; `text` is synced below.
	}, []);

	// The host may hand in a different value (revision restore, discard draft). Push it in without reporting it back.
	useEffect(() => {
		const view = viewRef.current;
		if (view && needsExternalSync(view.state, text)) view.dispatch(replaceBodySpec(view.state, text));
		setPreviewBody(text);
	}, [text]);

	// Debounced preview render. A newer edit supersedes an in-flight render.
	useEffect(() => {
		if (!showPreview) return;
		let cancelled = false;
		const timer = window.setTimeout(() => {
			void import("./preview.ts")
				.then(({ renderPreview }) => renderPreview(previewBody))
				.then((doc) => {
					if (cancelled) return;
					setPreviewDoc(doc);
					setPreviewError(null);
				})
				.catch((error: unknown) => {
					if (!cancelled) setPreviewError(error instanceof Error ? error.message : String(error));
				});
		}, 300);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [previewBody, showPreview]);

	const wrap = useCallback((before: string, after: string, placeholderText: string) => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch(wrapSelectionSpec(view.state, before, after, placeholderText));
		view.focus();
	}, []);

	// Full screen fills the browser window (a fixed overlay, not the Fullscreen API, so the media picker still opens above it).
	// The admin theme sets its colors on the page, so copy them onto the overlay: it must be opaque in light and dark mode.
	const toggleFullScreen = () => {
		if (!fullScreen) {
			const page = getComputedStyle(document.body);
			const root = getComputedStyle(document.documentElement);
			const opaque = (c: string) => c !== "transparent" && c !== "rgba(0, 0, 0, 0)";
			setFullScreenColors({
				background: opaque(page.backgroundColor) ? page.backgroundColor : opaque(root.backgroundColor) ? root.backgroundColor : "Canvas",
				color: page.color,
			});
		}
		setFullScreen(!fullScreen);
		window.requestAnimationFrame(() => viewRef.current?.focus());
	};

	// While full screen: Esc leaves it (unless the media picker is open: Esc closes that first), and the page behind does not scroll.
	useEffect(() => {
		if (!fullScreen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape" && !pickerOpen && !event.defaultPrevented) setFullScreen(false);
		};
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		document.addEventListener("keydown", onKey);
		return () => {
			document.body.style.overflow = overflow;
			document.removeEventListener("keydown", onKey);
		};
	}, [fullScreen, pickerOpen]);

	const insertImage = useCallback((item: MediaItem) => {
		const view = viewRef.current;
		if (!view) return;
		const alt = item.alt || item.filename.replace(/\.[^.]+$/, "");
		view.dispatch(insertAtSelectionSpec(view.state, imageMarkdown(alt, item.url)));
		view.focus();
	}, []);

	return (
		<div ref={slot}>
			{createPortal(
				<div className={fullScreen ? "gb-md gb-md-full" : "gb-md"} id={id} style={fullScreen ? fullScreenColors : undefined}>
					<div className="gb-md-head">
						<span className="gb-md-label">
							{label}
							{required ? " *" : ""}
						</span>
						<div className="gb-md-toolbar" role="toolbar" aria-label="Markdown formatting">
							<button type="button" onClick={() => wrap("**", "**", "bold")} title="Bold (Ctrl/Cmd+B)">
								<b>B</b>
							</button>
							<button type="button" onClick={() => wrap("*", "*", "italic")} title="Italic (Ctrl/Cmd+I)">
								<i>I</i>
							</button>
							<button type="button" onClick={() => wrap("`", "`", "code")} title="Inline code (Ctrl/Cmd+E)">
								{"</>"}
							</button>
							<button type="button" onClick={() => wrap("[", "](https://)", "link text")} title="Link (Ctrl/Cmd+K)">
								Link
							</button>
							<button type="button" onClick={() => setPickerOpen(true)} title="Insert image from the media library">
								Image
							</button>
							<button type="button" aria-pressed={showPreview} onClick={() => setShowPreview((v) => !v)} className="gb-md-toggle">
								Preview
							</button>
							<button
								type="button"
								aria-pressed={fullScreen}
								onClick={toggleFullScreen}
								className="gb-md-toggle"
								title={fullScreen ? "Exit full screen (Esc)" : "Fill the browser window"}
							>
								{fullScreen ? "Exit full screen" : "Full screen"}
							</button>
						</div>
					</div>
					<div className={showPreview ? "gb-md-panes gb-md-split" : "gb-md-panes"}>
						<div className="gb-md-editor" ref={host} />
						{showPreview ? (
							<div className="gb-md-preview">
								{previewError ? <p className="gb-md-error">Preview failed: {previewError}</p> : null}
								<iframe
									title="Preview"
									// No allow-scripts: a post body can contain raw HTML, and it must not run in the admin origin.
									sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
									srcDoc={previewDoc ?? ""}
								/>
							</div>
						) : null}
					</div>
					<MediaPickerModal
						open={pickerOpen}
						onOpenChange={setPickerOpen}
						onSelect={(item) => {
							insertImage(item);
							setPickerOpen(false);
						}}
						mediaKind="image"
						title="Insert image"
					/>
				</div>,
				portalRoot,
			)}
		</div>
	);
}
