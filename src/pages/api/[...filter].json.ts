import { getCollection, type CollectionEntry } from "astro:content"
import { date } from "@/utils/extract"
import type { APIRoute } from "astro"

type T_POST = CollectionEntry<"blog">

export const getStaticPaths = async () => {
  const posts = await getCollection("blog")

  const categoryResult = getStaticPathsByFilter(posts, (p) => [p.data.category])
  const [
    categoryYearResult,
    categoryYearMonthResult,
    categoryYearMonthDayResult,
  ] = addDateFilter((p) => [p.data.category], categoryResult)

  const tagResult = getStaticPathsByFilter(posts, (p) =>
    (p.data.tag ?? []).map((t) => `tag/${t.toLowerCase()}`)
  )
  const [tagYearResult, tagYearMonthResult, tagYearMonthDayResult] =
    addDateFilter(
      (p) => (p.data.tag ?? []).map((t) => `tag/${t.toLowerCase()}`),
      tagResult
    )

  const seriesResult = getStaticPathsByFilter(posts, (p) =>
    p.data.series?.slug ? [`series/${p.data.series.slug}`] : []
  )
  const [seriesYearResult, seriesYearMonthResult, seriesYearMonthDayResult] =
    addDateFilter(
      (p) => (p.data.series?.slug ? [`series/${p.data.series.slug}`] : []),
      seriesResult
    )

  const [yearResult, yearMonthResult, yearMonthDayResult] = addDateFilter(
    () => ["all"]
  )

  return [
    {
      params: {
        filter: "all",
      },
      props: {
        posts,
      },
    },
    ...categoryResult,
    ...categoryYearResult,
    ...categoryYearMonthResult,
    ...categoryYearMonthDayResult,

    ...tagResult,
    ...tagYearResult,
    ...tagYearMonthResult,
    ...tagYearMonthDayResult,

    ...seriesResult,
    ...seriesYearResult,
    ...seriesYearMonthResult,
    ...seriesYearMonthDayResult,

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

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = ({ props }) => {
  return new Response(JSON.stringify(props))
}
