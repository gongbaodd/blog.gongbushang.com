# Grow Gen – A Personal Space for Tech & Life

Hi, I'm **J. Gong** 👋 – A web developer from China with a passion for continuous learning and creative expression.

## About This Site

This is my digital space to share:

- 🎙️ **[Podcast](/podcast)** – Browse episode pages and choose to listen on Spotify
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

- **[EmDash](https://docs.emdashcms.com)** – CMS on **[Astro](https://astro.build)**; content in **Supabase** Postgres
- **React** islands with **Mantine** and **Tailwind CSS**, written in **TypeScript**
- **Cloudflare Workers** – hosting (prerendered pages, Hyperdrive to the database)
- **Cloudinary** – images and media
- **Rust** – UMAP layout for the post map

## 🧞 Commands

The repo is a pnpm workspace (`apps/web` is the site, `apps/admin` the CMS admin). Run from the root:

| Command                      | Action                                                   |
| :--------------------------- | :------------------------------------------------------- |
| `pnpm install`               | Installs dependencies                                    |
| `pnpm db:start`              | Starts a local Supabase                                  |
| `pnpm --filter web dev`      | Starts the site dev server at `localhost:4321`           |
| `pnpm --filter web build`    | Derives data, then builds the site into `apps/web/dist/` |
| `pnpm --filter web test`     | Runs the site's unit tests                               |
| `pnpm --filter web test:e2e` | Builds and runs the Playwright + Cucumber e2e suite      |
| `pnpm admin:local`           | Starts the admin against the local database              |

See `CLAUDE.md` and `.agents/skills/emdash/SKILL.md` for the full guide.

## 📖 Learn More

- [Astro Documentation](https://docs.astro.build)
- [View my CV](https://www.growgen.xyz/resume)
- [Visit my site](https://growgen.xyz)
