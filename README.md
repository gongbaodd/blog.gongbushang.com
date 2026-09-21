# Grow Gen – A Personal Space for Tech & Life

Hi, I'm **J. Gong** 👋 – A web developer from China with a passion for continuous learning and creative expression.

## About This Site

This is my digital space to share:

- 🛠️ **[Tech journals](/tech)** – Web development insights and technical reflections
- ✍️ **[Daily life notes](/plan)** – Thoughts and observations from everyday life
- ✈️ **[Travel stories](/world)** – Adventures and experiences around the globe
- 📚 **[Study reflections](/fe)** – Learning notes and educational explorations

## About Me

💻 **Web Developer** – Coding since the jQuery era through React, with expertise in TypeScript and JavaScript  
🎮 **Game Programmer** – Exploring game development with Unity, Godot, and p5.js  
🎙️ **Podcaster** | 🏋🏻‍♂️ **Crossfitter** | 🎨 **Tattoo artist** | 🎵 **Harmonica player**  
🌍 **Traveler** | 🌊 **Surfer** | 🐦 **Language learner** (Duolingo addict)

Currently studying **Digital Learning Games** at **Tallinn University, Estonia**.

### The Name "Grow Gen"

- Inspired by Northeastern Chinese slang **"给我整" (gěi wǒ zhěng)"** – "Just do it" 💡
- Millennial generations are always learning and evolving 🌱
- Sounds like my name in Mandarin 🎶

### What I Believe In

The future of human–computer interaction lies in **gamification**. Learning should be engaging, interactive, and fun.

## Technical Stack

This site is built with:

- **[Astro](https://astro.build)** – Fast, modern static site builder
- **React** – Interactive components
- **TypeScript** – Type-safe development
- **Tailwind CSS** – Utility-first styling
- **Vercel** – Hosting and CI/CD
- **Cloudflare Workers** – RESTful API backend

## 🧞 Commands

All commands are run from the root of the project:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 🎭 E2E tests (Playwright + Cucumber)

Browser tests live in `e2e/`: Cucumber owns the Gherkin scenarios and the test
run, Playwright drives the browser, and the suite always runs against the
production build served by `astro preview` on `127.0.0.1:4321`. The Vitest
unit/component suite (`pnpm test`) is separate and stays fast.

One-time setup (installs the Chromium binary into `~/.cache/ms-playwright`):

```sh
pnpm install
pnpm exec playwright install chromium
```

| Command               | Action                                                                      |
| :-------------------- | :-------------------------------------------------------------------------- |
| `pnpm test:e2e`       | Build the site, start `astro preview`, run the whole suite, stop the server |
| `pnpm test:e2e:smoke` | Run only the `@smoke` scenarios against an already running preview          |
| `pnpm test:e2e:run`   | Run the full suite against an already running preview                       |

Run a focused subset against an already running preview (`pnpm preview --host
127.0.0.1 --port 4321`):

```sh
# by tag expression
pnpm exec cucumber-js --config cucumber.mjs --tags "@extended and not @mobile"
# by scenario name
pnpm exec cucumber-js --config cucumber.mjs --name "search"
```

Notes:

- `pnpm test:e2e` refuses to start if port 4321 is already occupied by another
  server (`e2e/check-port.mjs`), so it never tests the wrong site.
- Set `E2E_BASE_URL` (and `E2E_PORT` for the preflight) to target a server on
  another port; `E2E_TRACE=1` saves Playwright traces to
  `e2e-results/traces/`, `E2E_HEADED=1` runs the browser headed.
- After a failure, open `e2e-results/cucumber-report.html` for the scenario
  report with an attached screenshot (`e2e-results/screenshots/`), and the
  trace zip for browser-level reproduction.
- The public view counter (pv.growgen.xyz) is stubbed per scenario so journeys
  never depend on that external service; everything else runs as built.

## 📖 Learn More

- [Astro Documentation](https://docs.astro.build)
- [View my CV](https://www.growgen.xyz/resume)
- [Visit my site](https://growgen.xyz)
