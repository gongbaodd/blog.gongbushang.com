const config = require("./packages/shadcn/tailwind.config");

module.exports = {
  ...config,
  content: [
    "./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
    "./packages/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
    "!./packages/**/node_modules/**/*",
  ],
  plugins: [
    require("@tailwindcss/typography"),
    // ...
  ],
};
