// `excerpt` (0.0.1) ships no types: `excerpt(text, query, length)` returns a snippet around the first match.
declare module "excerpt" {
	export default function excerpt(text: string, query: string, length?: number): string;
}
