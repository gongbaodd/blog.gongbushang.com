// Icon map for social links. EmDash stores only the icon key (menu item `cssClasses`).
// Unknown keys fall back to a text-only anchor, never a broken icon.
// "mail" is rendered with the lucide Mail icon in MantineFooter.
import GitHub from "../icons/github.svg?raw";
import X from "../icons/x.svg?raw";
import Linkedin from "../icons/linkedin.svg?raw";
import Instagram from "../icons/instagram.svg?raw";
import Threads from "../icons/threads.svg?raw";
import Youtube from "../icons/youtube.svg?raw";
import Spotify from "../icons/spotify.svg?raw";
import Itchio from "../icons/itchdotio.svg?raw";
import Jike from "../icons/jike.svg?raw";
import Xiaohongshu from "../icons/xiaohongshu.svg?raw";
import Facebook from "../icons/facebook.svg?raw";
import Bilibili from "../icons/bilibili.svg?raw";
import V2ex from "../icons/v2ex.svg?raw";

export const SOCIAL_ICONS: Record<string, string> = {
  github: GitHub,
  x: X,
  linkedin: Linkedin,
  instagram: Instagram,
  threads: Threads,
  youtube: Youtube,
  spotify: Spotify,
  itchio: Itchio,
  jike: Jike,
  xiaohongshu: Xiaohongshu,
  facebook: Facebook,
  bilibili: Bilibili,
  v2ex: V2ex,
};
