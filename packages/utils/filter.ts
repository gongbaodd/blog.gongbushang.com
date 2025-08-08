import { getCollection, type CollectionEntry } from "astro:content"
import { date, excerpt, title } from "./extract"
import { FILTER_ENTRY } from "../consts"
import { memoize } from "es-toolkit"

type T_POST = CollectionEntry<"blog">

const STATIC_ENTRIES = [
  FILTER_ENTRY.ALL,
  FILTER_ENTRY.TAG,
  FILTER_ENTRY.SERIES,
]

export const getAllFilterEntries = async () => {
  const posts = await getCollection("blog")
  const entries = new Set<string>(STATIC_ENTRIES)
  const getMemorizedCategoryFilterEntries = memoize(getCategoryFilterEntries, { getCacheKey: () => posts.length.toString() });

  const categoryEntries = getMemorizedCategoryFilterEntries()

  return [
    ...entries,
    ...categoryEntries,
  ]

  function getCategoryFilterEntries() {
    const categoryEntries = new Set<string>()
    for (const post of posts) {
      if (post.data.category) {
        categoryEntries.add(post.data.category.toLowerCase())
      }
    }

    return categoryEntries
  }
}

export const getFilteredPage = async () => {
  const posts = await getCollection("blog")

  const getMemorizedCategoryResult = memoize(() => getStaticPathsByFilter(posts, (p) => [p.data.category]), { getCacheKey: () => posts.length });
  const categoryResult = getMemorizedCategoryResult();

  const getMemorizedTagResult = memoize(() => getStaticPathsByFilter(posts, (p) => (p.data.tag ?? []).map((t: string) => `${FILTER_ENTRY.TAG}/${t.toLowerCase()}`)), { getCacheKey: () => posts.length });
  const tagResult = getMemorizedTagResult();

  const getMemorizedSeriesResult = memoize(() => getStaticPathsByFilter(posts, (p) =>
    p.data.series?.slug ? [`${FILTER_ENTRY.SERIES}/${p.data.series.slug}`] : []
  ), { getCacheKey: () => posts.length });
  const seriesResult = getMemorizedSeriesResult();

  const [yearResult, yearMonthResult, yearMonthDayResult] = addDateFilter(
    () => [FILTER_ENTRY.ALL],
  )

  return [
    {
      params: {
        filter: FILTER_ENTRY.ALL,
      },
      props: {
        posts: sortPostsByDate(posts),
      },
    },
    ...categoryResult,
    ...tagResult,
    ...seriesResult,
    ...yearResult,
    ...yearMonthResult,
    ...yearMonthDayResult,
  ]

  function getStaticPathsByFilter(
    posts: Set<T_POST> | T_POST[],
    filterFn: (p: T_POST) => string[]
  ) {
    const items = new Map<string, Set<T_POST>>()

    for (const post of posts) {
      const filters = filterFn(post)
      filters.forEach((filter) => {
        if (!items.has(filter)) {
          items.set(filter, new Set<T_POST>())
        }
        items.get(filter)?.add(post)
      })
    }

    const result = []
    for (const [filter, posts] of items) {
      result.push({
        params: {
          filter,
        },
        props: {
          posts: sortPostsByDate(Array.from(posts)),
        },
      })
    }

    return result
  }

  function sortPostsByDate(posts: T_POST[]) {
    return posts.toSorted((p1, p2) => {
      const d1 = new Date(date(p1))
      const d2 = new Date(date(p2))
      return d1 > d2 ? -1 : 1
    })
  }

  function addFilter(
    preItems: ReturnType<typeof getStaticPathsByFilter>,
    filterFn: (p: T_POST) => string[]
  ) {
    const results = []
    for (const preItem of preItems) {
      const { posts } = preItem.props
      const result = getStaticPathsByFilter(posts, filterFn)

      results.push(...result)
    }

    return results
  }

  function addDateFilter(
    filterFn: (p: T_POST) => string[],
    result?: ReturnType<typeof getStaticPathsByFilter>
  ) {
    const yearResult = result
      ? addFilter(result, (p) => {
        const filters = filterFn(p)
        const _date = date(p)
        const year = _date.getFullYear().toString()
        return filters.map((filter) => `${filter}/${year}`)
      })
      : getStaticPathsByFilter(posts, (p) => {
        const filters = filterFn(p)
        const _date = date(p)
        const year = _date.getFullYear().toString()
        return filters.map((filter) => `${filter}/${year}`)
      })

    const yearMonthResult = addFilter(yearResult, (p) => {
      const filters = filterFn(p)
      const _date = date(p)
      const year = _date.getFullYear().toString()
      const month = (_date.getMonth() + 1).toString().padStart(2, "0")
      return filters.map((filter) => `${filter}/${year}/${month}`)
    })

    const yearMonthDayResult = addFilter(yearMonthResult, (p) => {
      const filters = filterFn(p)
      const _date = date(p)
      const year = _date.getFullYear().toString()
      const month = (_date.getMonth() + 1).toString().padStart(2, "0")
      const day = _date.getDate().toString().padStart(2, "0")
      return filters.map((filter) => `${filter}/${year}/${month}/${day}`)
    })

    return [yearResult, yearMonthResult, yearMonthDayResult]
  }
}

export async function mapServerPostToClient(posts: T_POST[]) {
  return await Promise.all(
    posts.map(async (post) => ({
      id: post.id,
      href: `/${post.data.category}/${post.id}`,
      title: title(post),
      date: date(post),
      data: post.data,
      excerpt: await excerpt(post),
    }))
  );
}

export async function isValidFilter(filter: string) {
  const validFiltes = await getAllFilterEntries();
  const parts = filter.split("/").filter(Boolean) ?? [];
  return validFiltes.some((f) => f === parts[0]);
}