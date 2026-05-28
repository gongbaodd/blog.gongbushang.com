# Gallery folder

Drop your images here to use them as particle sources.

## Supported formats

- `.jpg` / `.jpeg`
- `.png`
- `.webp`

## How to use

1. Copy image files into this folder.
2. Restart the dev server (`npm run dev`) or run a new build (`npm run build`).
3. Click a thumbnail in the picker at the bottom of the page.

Images are scaled to **320×180** internally. Larger sources are downscaled automatically.

## Tips

- High-contrast silhouettes work best (dark backgrounds are culled).
- After adding or removing files, restart Vite so it rescans the folder.
