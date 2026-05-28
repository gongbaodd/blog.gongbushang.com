# Interactive Particles (Three.js)

Interactive instanced particle effect based on the [Codrops tutorial](https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/) by Bruno Imbrizi.

Move your mouse over the particles to displace them. Use the picker at the bottom to switch images.

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Images

| Location | Purpose |
|----------|---------|
| `public/images/rhino.png` | Default image on load |
| `gallery/` | Drop your own images here |

See [`gallery/README.md`](gallery/README.md) for supported formats. After adding or removing gallery files, **restart** the dev server so Vite picks them up.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Stack

- [Three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/) + [vite-plugin-glsl](https://github.com/UstymUstymov/vite-plugin-glsl)
