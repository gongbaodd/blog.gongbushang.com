import { getCollection, type CollectionEntry } from "astro:content"
import { date } from "../../packages/utils/extract"
import { FILTER_ENTRY } from "../../packages/consts"
import lodash from "lodash"
const { memoize } = lodash

type T_POST = CollectionEntry<"blog">

export const getFilteredPage = async () => {
  const posts = await getCollection("blog")
  
  const getMemorizedCategoryResult = memoize(() => getStaticPathsByFilter(posts, (p) => [p.data.category]), () => posts.length);
  const categoryResult = getMemorizedCategoryResult();

  const getMemorizedTagResult = memoize(() => getStaticPathsByFilter(posts, (p) => (p.data.tag ?? []).map((t: string) => `${FILTER_ENTRY.TAG}/${t.toLowerCase()}`)), () => posts.length);
  const tagResult = getMemorizedTagResult();

  const getMemorizedSeriesResult = memoize(() => getStaticPathsByFilter(posts, (p) =>
    p.data.series?.slug ? [`${FILTER_ENTRY.SERIES}/${p.data.series.slug}`] : []
  ), () => posts.length);
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
        posts,
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
          posts: [...posts],
        },
      })
    }

    return result
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
