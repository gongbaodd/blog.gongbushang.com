import chroma from "chroma-js";
import { TITLE_COLOR_MAP } from "../../consts/colors.ts";

export function isRemote(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function stripQuery(url: string): string {
  return url.replace(/[?#].*$/, "");
}

export function findNearestTitleColor(color: string): string {
  let distance = Infinity;
  let nearestColor = "";
  for (const [name, value] of Object.entries(TITLE_COLOR_MAP)) {
    const dis = chroma.deltaE(color, value);
    if (dis < distance) {
      distance = dis;
      nearestColor = name;
    }
  }
  return nearestColor;
}
