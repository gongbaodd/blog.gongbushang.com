import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RSS_URL = "https://anchor.fm/s/f483db10/podcast/rss";

/**
 * Very small, feed-specific XML helpers.
 */
function getTagContent(block, tag) {
  const cdataRe = new RegExp(
    `<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    "i",
  );
  const simpleRe = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");

  const m1 = block.match(cdataRe);
  if (m1) return m1[1].trim();
  const m2 = block.match(simpleRe);
  if (m2) return m2[1].trim();
  return "";
}

function getAttrValue(block, tag, attr) {
  const re = new RegExp(
    `<${tag}[^>]*?${attr}="([^"]+)"[^>]*?>`,
    "i",
  );
  const m = block.match(re);
  return m ? m[1] : "";
}

function parseItems(xml) {
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  const items = [];
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const itemXml = m[0];
    const title = getTagContent(itemXml, "title");
    const link = getTagContent(itemXml, "link");
    const guid = getTagContent(itemXml, "guid") || link;
    const pubDate = getTagContent(itemXml, "pubDate");
    const description = getTagContent(itemXml, "description");
    const summary = getTagContent(itemXml, "itunes:summary") || description;
    const duration = getTagContent(itemXml, "itunes:duration");
    const audioUrl = getAttrValue(itemXml, "enclosure", "url");
    const image =
      getAttrValue(itemXml, "itunes:image", "href") ||
      getAttrValue(itemXml, "image", "href");

    items.push({
      id: guid || title,
      title,
      link,
      pubDate,
      description,
      summary,
      duration,
      audioUrl,
      image,
    });
  }
  return items;
}

async function main() {
  const res = await fetch(RSS_URL);
  if (!res.ok) {
    console.error("Failed to fetch RSS:", res.status, res.statusText);
    process.exitCode = 1;
    return;
  }
  const xml = await res.text();

  const channelXmlMatch = xml.match(/<channel>[\s\S]*?<\/channel>/i);
  const channelXml = channelXmlMatch ? channelXmlMatch[0] : xml;

  const channelTitle = getTagContent(channelXml, "title");
  const channelDescription = getTagContent(channelXml, "description");
  const channelLink = getTagContent(channelXml, "link");
  const channelImage = getAttrValue(channelXml, "itunes:image", "href");

  const episodes = parseItems(channelXml);

  const data = {
    channel: {
      title: channelTitle,
      description: channelDescription,
      link: channelLink,
      image: channelImage,
    },
    episodes,
  };

  const outDir = path.join(__dirname, "..", "src", "data");
  const outFile = path.join(outDir, "podcast.json");
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(
    outFile,
    JSON.stringify(data, null, 2),
    "utf8",
  );
  console.log("Wrote podcast data to", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

