// Stops Vite from walking up to the legacy repo-root postcss.config.mjs (Tailwind v3),
// which breaks the EmDash admin's Tailwind v4 CSS. Delete when the legacy site is removed.
export default { plugins: [] };
