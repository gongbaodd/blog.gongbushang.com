import { date, excerpt, title } from "./extract"
import { FILTER_ENTRY, POST_COUNT_PER_PAGE } from "../consts"
import { flatMap, memoize } from "es-toolkit"
import dayjs from "dayjs"
import { getAllPosts, type T_PROPS } from "./post"

type T_POST = T_PROPS;

const STATIC_ENTRIES = [
  FILTER_ENTRY.ALL,
  FILTER_ENTRY.TAG,
  FILTER_ENTRY.SERIES,
]

export async function getAllPostByDateDesc() {
  const posts = await getAllPosts()
  return sortPostsByDate(posts)
}

function getCategoryFilterEntries(posts: T_POST[]) {
  const categoryEntries = new Set<string>()
  for (const post of posts) {
    if (post.data.category) {
      categoryEntries.add(post.data.category.toLowerCase())
    }
  }

  return categoryEntries
}

const getMemorizedCategoryFilterEntries = memoize(getCategoryFilterEntries, { getCacheKey: (posts: T_POST[]) => posts.length.toString() });

export const getAllFilterEntries = async () => {
  const posts = await getAllPosts()
  const entries = new Set<string>(STATIC_ENTRIES)

  const categoryEntries = getMemorizedCategoryFilterEntries(posts)

  return [
    ...entries,
    ...categoryEntries,
  ]
}


let categoryPostMap = new Map<string, Set<T_POST>>()
const _initCategoryPostMap = memoize((posts: T_POST[]) => {
  categoryPostMap = createPostMap(posts, (p) => [p.data.category])
  return categoryPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initCategoryPostMap(posts: T_POST[]) {
  return _initCategoryPostMap(posts)
}

export const getFilterByCategoryPage = async () => {
  const posts = await getAllPosts()
  const categoryPostMap = initCategoryPostMap(posts)
  const categoryResult = Array.from(categoryPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

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
  ]
}

export const isValidCategoryFilter = async (filter: string) => {
  if (filter === FILTER_ENTRY.ALL) return true

  const posts = await getAllPosts()
  const categoryPostMap = initCategoryPostMap(posts)
  const categoryEntries = Array.from(categoryPostMap, ([filter]) => filter)

  return categoryEntries.some(v => filter === v)
}

let tagPostMap = new Map<string, Set<T_POST>>()
const _initTagPostMap = memoize((posts: T_POST[]) => {
  tagPostMap = createPostMap(posts, (p) => (p.data.tag ?? []).map((t: string) => t.toLowerCase()))
  return tagPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initTagPostMap(posts: T_POST[]) {
  return _initTagPostMap(posts)
}

export const getFilterByTagPage = async () => {
  const posts = await getAllPosts()
  const tagPostMap = initTagPostMap(posts)
  const tagResult = Array.from(tagPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return tagResult
}


let cityPostMap = new Map<string, Set<T_POST>>()
const _initCityPostMap = memoize((posts: T_POST[]) => {
  cityPostMap = createPostMap(posts, (p) => (p.data.city ?? []).map((t: string) => t.toLowerCase()))
  return cityPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initCityPostMap(posts: T_POST[]) {
  return _initCityPostMap(posts)
}

export const getFilterByCityPage = async () => {
  const posts = await getAllPosts()
  const cityPostMap = initCityPostMap(posts)
  const cityResult = Array.from(cityPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return cityResult
}


export const isValidTagFilter = async (filter: string) => {
  const posts = await getAllPosts()
  const tagPostMap = initTagPostMap(posts)
  const tagEntries = Array.from(tagPostMap, ([filter]) => filter)

  return tagEntries.some(v => filter === v)
}


let seriesPostMap = new Map<string, Set<T_POST>>()

const _initSeriesPostMap = memoize((posts: T_POST[]) => {
  seriesPostMap = createPostMap(posts, (p) =>
    p.data.series?.slug ? [p.data.series.slug] : []
  )
  return seriesPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initSeriesPostMap(posts: T_POST[]) {

  return _initSeriesPostMap(posts)
}

export const getFilterBySeriesPage = async () => {
  const posts = await getAllPosts()
  const seriesPostMap = initSeriesPostMap(posts)
  const seriesResult = Array.from(seriesPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return seriesResult
}
export const isValidSeriesFilter = async (filter: string) => {
  const posts = await getAllPosts()
  const tagPostMap = initSeriesPostMap(posts)
  const tagEntries = Array.from(tagPostMap, ([filter]) => filter)

  return tagEntries.some(v => filter === v)
}

export async function isValidFilter(filter: string) {
  const validFiltes = await getAllFilterEntries();
  const parts = filter.split("/").filter(Boolean) ?? [];
  return validFiltes.some((f) => f === parts[0]);
}


export function page(filterFn: typeof getFilterByCityPage | typeof getFilterByCategoryPage | typeof getFilterBySeriesPage | typeof getFilterByTagPage | typeof getFilterByYearPage) {
  return async () => {
    const results = await filterFn();
    type T_RES = typeof results[0];
    type T_PAGED_RES = T_RES & {
      params: (T_RES extends { params: object } ? T_RES["params"] : {}) & {
        page: number;
      };
    }

    const posts = sortPostsByDate(flatMap(results, res => res.props.posts))

    const pagedResults: T_PAGED_RES[] = [];

    for (let j = 0; j < posts.length; j += POST_COUNT_PER_PAGE) {
      pagedResults.push({
        ...results[0],
        params: {
          ...results[0].params,
          page: Math.floor(j / POST_COUNT_PER_PAGE)
        },
        props: {
          posts: posts.slice(j, j + POST_COUNT_PER_PAGE)
        }
      })
    }

    return pagedResults;
  }
}

export function createPostMap(posts: Set<T_POST> | T_POST[], filterFn: (p: T_POST) => string[]) {
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

  return items
}

const memSort = memoize((posts: T_POST[]) => {
  return posts.toSorted((p1, p2) => {
    const d1 = new Date(date(p1))
    const d2 = new Date(date(p2))
    return d1 > d2 ? -1 : 1
  })
})

export function sortPostsByDate(posts: T_POST[]) {
  return memSort(posts)
}


let yearPostMap = new Map<string, Set<T_POST>>()

const _initYearPostMap = memoize((posts: T_POST[]) => {
  yearPostMap = createPostMap(posts, (p) => [dayjs(date(p)).format("YYYY")])
  return yearPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initYearPostMap(posts: T_POST[]) {

  return _initYearPostMap(posts)
}

export const getFilterByYearPage = async () => {
  const posts = await getAllPosts()
  initYearPostMap(posts)
  const yearResult = Array.from(yearPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return yearResult
}


let monthPostMap = new Map<string, Set<T_POST>>()

const _initYearMonthPostMap = memoize((posts: T_POST[]) => {
  monthPostMap = createPostMap(posts, (p) =>
    [dayjs(date(p)).format("YYYY-MM")]
  )
  return monthPostMap
}, { getCacheKey: (posts) => Array.from(posts).length })

export function initYearMonthPostMap(posts: T_POST[]) {

  return _initYearMonthPostMap(posts)
}

export const getFilterByMonthPage = async () => {
  const posts = await getAllPosts()
  initYearMonthPostMap(posts)
  const ymResult = Array.from(seriesPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return ymResult
}