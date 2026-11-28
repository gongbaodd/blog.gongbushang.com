/** Block Kit rendering of the build/version state (structural subset of `@emdash-cms/blocks`; the host validates the real shape). */
import { describeVersion, type VersionState } from "./version.ts";

export type Block = { type: "header" | "context"; text: string } | { type: "section"; text: string } | { type: "divider" };
export interface BlockResponse {
	blocks: Block[];
}

export function versionBlocks(state: VersionState, surface: "page" | "widget"): BlockResponse {
	const { headline, detail } = describeVersion(state);
	const blocks: Block[] = [];
	if (surface === "page") blocks.push({ type: "header", text: "Admin build" });
	blocks.push({ type: "section", text: `**${headline}**` }, { type: "context", text: detail });
	if (state.status !== "dev") {
		if (state.builtAt) blocks.push({ type: "context", text: `Built ${state.builtAt}` });
		if (surface === "page") blocks.push({ type: "context", text: `Commit ${state.running}` });
	}
	return { blocks };
}
