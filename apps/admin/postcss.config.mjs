// Stop Vite from walking up to the legacy repo-root postcss.config.mjs (which runs Tailwind v3
// and fails on EmDash admin's Tailwind v4 `@layer base` CSS).
export default { plugins: [] };
