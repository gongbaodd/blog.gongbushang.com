// Stable fixture posts, chosen from the pinned `src/content` submodule.
// Their routes and search terms are the contract between scenarios and
// content: if the content submodule moves a post, only this file needs
// updating.

/** Post used by the search journey. Title = the post's first heading. */
export const FIXTURE_POST = {
  /** Term that mini-search matches against the fixture post. */
  searchTerm: "Mermaid",
  title: "Mermaid: Wait, UMLs are Back!",
  /** URL of the post under /{category}/{id}. */
  href: "/fe/2025/09/08/mermaid",
} as const;

/** Post with shiki-highlighted code blocks, used by the content journey. */
export const CODE_FIXTURE_POST = {
  title: "Using Mini-Max Algorithm to Play Tetris 🎮",
  href: "/fe/2025/09/09/tetris-ai",
} as const;
