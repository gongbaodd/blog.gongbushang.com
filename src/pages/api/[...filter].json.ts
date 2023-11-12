import { getCollection } from "astro:content"
import { date } from "@/utils/extract"
import type { APIRoute } from "astro"

export const getStaticPaths = async () => {
  const posts = await getCollection("blog")
  type T_POST = (typeof posts)[0]

  const categoryResult = getStaticPathsByFilter(posts, (p) => p.data.category)

  const categoryYearResult = addFilter(categoryResult, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    return `${p.data.category}/${year}`
  })

  const categoryYearMonthResult = addFilter(categoryYearResult, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    const month = (_date.getMonth() + 1).toString().padStart(2, "0")
    return `${p.data.category}/${year}/${month}`
  })

  const categoryYearMonthDayResult = addFilter(categoryYearMonthResult, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    const month = (_date.getMonth() + 1).toString().padStart(2, "0")
    const day = _date.getDate().toString().padStart(2, "0")
    return `${p.data.category}/${year}/${month}/${day}`
  })

  const yearResult = getStaticPathsByFilter(posts, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    return year
  })

  const yearMonthResult = addFilter(yearResult, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    const month = (_date.getMonth() + 1).toString().padStart(2, "0")
    return `${year}/${month}`
  })

  const yearMonthDayResult = addFilter(yearMonthResult, (p) => {
    const _date = date(p)
    const year = _date.getFullYear().toString()
    const month = (_date.getMonth() + 1).toString().padStart(2, "0")
    const day = _date.getDate().toString().padStart(2, "0")
    return `${year}/${month}/${day}`
  })

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
    ...yearResult,
    ...yearMonthResult,
    ...yearMonthDayResult,
  ]

  function getStaticPathsByFilter(
    posts: Set<T_POST> | T_POST[],
    filterFn: (p: T_POST) => string
  ) {
    const items = new Map<string, Set<T_POST>>()

    for (const post of posts) {
      const filter = filterFn(post)
      const item = items.get(filter)

      if (!item) {
        const posts = new Set<T_POST>()
        posts.add(post)
        items.set(filter, posts)
      } else {
        item.add(post)
      }
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
    filterFn: (p: T_POST) => string
  ) {
    const results = []
    for (const preItem of preItems) {
      const { posts } = preItem.props
      const result = getStaticPathsByFilter(posts, filterFn)

      results.push(...result)
    }

    return results
  }
}

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = ({ props }) => {
  return new Response(JSON.stringify(props))
}