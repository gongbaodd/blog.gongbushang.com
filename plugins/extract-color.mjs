import {Vibrant} from "node-vibrant/node";
import path from "path";
import fs from "fs";

export default function remarkExtractColors() {
  return async (tree, file) => {
    const data = file.data.astro;
    const frontmatter = data.frontmatter;

    console.error("[ColorPlugin] Processing file:", file.data);
    fs.appendFileSync("color-plugin.log", `[${new Date().toISOString()}] ${JSON.stringify(file)}\n`);

    if (frontmatter.cover?.url) {
      const filePath = path.resolve("./src/content", frontmatter.cover.url);
      if (fs.existsSync(filePath)) {
        try {
          const palette = await Vibrant.from(filePath).getPalette();
          frontmatter.palette = {
            dominant: palette?.DarkVibrant?.hex,
            vibrant: palette?.Vibrant?.hex,
          };
        } catch (err) {
          console.warn("Color extraction failed:", err);
        }
      }
    }
  };
}