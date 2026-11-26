/**
 * Builds the Category → Year tree behind the `/sitemap` treemap and its crawlable link list.
 * Pure on purpose (no `astro:content`) so it is unit-testable; the page maps posts to inputs.
 */
export interface ISitemapPostInput {
  category: string;
  year: string;
}

// Node shapes are type aliases, not interfaces: Recharts' `TreemapDataType` has an index
// signature, which type aliases satisfy implicitly and interfaces do not.
export type ISitemapYearNode = {
  name: string;
  category: string;
  href: string;
  value: number;
  /** Index of the parent category (largest first), used to pick the cell colour. */
  colorIndex: number;
};

export type ISitemapCategoryNode = {
  name: string;
  href: string;
  value: number;
  children: ISitemapYearNode[];
};

export interface ISitemapTree {
  name: string;
  value: number;
  children: ISitemapCategoryNode[];
}

export const SITEMAP_ROOT_NAME = "GrowGen";

export function buildSitemapTree(posts: ISitemapPostInput[]): ISitemapTree {
  const counts = new Map<string, Map<string, number>>();

  for (const { category, year } of posts) {
    const years = counts.get(category) ?? new Map<string, number>();
    years.set(year, (years.get(year) ?? 0) + 1);
    counts.set(category, years);
  }

  const total = (years: Map<string, number>) => [...years.values()].reduce((a, b) => a + b, 0);

  const children = [...counts]
    .toSorted(([nameA, a], [nameB, b]) => total(b) - total(a) || nameA.localeCompare(nameB))
    .map(([category, years], colorIndex): ISitemapCategoryNode => {
      const yearNodes = [...years]
        .toSorted(([a], [b]) => b.localeCompare(a))
        .map(([year, value]): ISitemapYearNode => ({
          name: year,
          category,
          // There is no category+year list page; year pages list that year across categories.
          href: `/year/${year}`,
          value,
          colorIndex,
        }));

      return {
        name: category,
        href: `/${category}`,
        value: total(years),
        children: yearNodes,
      };
    });

  return {
    name: SITEMAP_ROOT_NAME,
    value: children.reduce((sum, c) => sum + c.value, 0),
    children,
  };
}
