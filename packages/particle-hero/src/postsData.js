export const CATEGORY_COLORS = {
  fe: '#4a9eff',
  life: '#7ed957',
  tech: '#b47aff',
  plan: '#ffb347',
  movie: '#ff6b9d',
  book: '#ffd166',
  sport: '#06d6a0',
  tv: '#ef476f',
  music: '#118ab2',
};

const DEFAULT_COLOR = '#aaaaaa';

export function getCategoryColor(label) {
  return CATEGORY_COLORS[label] ?? DEFAULT_COLOR;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function getPostYear(post) {
  return post.date?.slice(0, 4) ?? '';
}

export function getFilterOptions(posts) {
  const categories = [...new Set(posts.map((p) => p.category?.label).filter(Boolean))].sort();
  const years = [...new Set(posts.map(getPostYear).filter(Boolean))].sort();
  return { categories, years };
}

export async function fetchPosts() {
  const res = await fetch('/data.json');
  if (!res.ok) throw new Error(`Failed to load data.json: ${res.status}`);
  const data = await res.json();
  return data.posts;
}

export function normalizePostPositions(posts, width, height, padding = 0.08) {
  // umap2D[1] → horizontal, umap2D[0] → vertical (90° CW from raw UMAP axes)
  const xs = posts.map((p) => p.umap2D[1]);
  const ys = posts.map((p) => p.umap2D[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const innerW = width * (1 - 2 * padding);
  const innerH = height * (1 - 2 * padding);
  const offsetX = width * padding;
  const offsetY = height * padding;

  return posts.map((post) => {
    const nx = offsetX + ((post.umap2D[1] - minX) / rangeX) * innerW;
    const ny = offsetY + ((post.umap2D[0] - minY) / rangeY) * innerH;
    return {
      ...post,
      x: nx,
      y: height - ny,
    };
  });
}
