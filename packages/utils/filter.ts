import { getCollection, type CollectionEntry } from "astro:content"
import { date, excerpt, title } from "./extract"
import { FILTER_ENTRY, POST_COUNT_PER_PAGE } from "../consts"
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

let categoryPostMap = new Map<string, Set<T_POST>>()
function initCategoryPostMap(posts: Set<T_POST> | T_POST[]) {
  const init = memoize(() => {
    categoryPostMap = createPostMap(posts, (p) => [p.data.category])
    return categoryPostMap
  }, { getCacheKey: () => Array.from(posts).length })
  return init()
}

export const getFilterByCategoryPage = async () => {
  const posts = await getCollection("blog")
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

  const posts = await getCollection("blog")
  const categoryPostMap = initCategoryPostMap(posts)
  const categoryEntries = Array.from(categoryPostMap, ([filter]) => filter)

  return categoryEntries.some(v => filter === v)
}

let tagPostMap = new Map<string, Set<T_POST>>()
function initTagPostMap(posts: Set<T_POST> | T_POST[]) {
  const init = memoize(() => {
    tagPostMap = createPostMap(posts, (p) => (p.data.tag ?? []).map((t: string) => t.toLowerCase()))
    return tagPostMap
  }, { getCacheKey: () => Array.from(posts).length })
  return init()
}

export const getFilterByTagPage = async () => {
  const posts = await getCollection("blog")
  const tagPostMap = initTagPostMap(posts)
  const tagResult = Array.from(tagPostMap, ([filter, postsSet]) => ({
    params: {
      filter,
    },
    props: { posts: sortPostsByDate(Array.from(postsSet)) },
  }))

  return tagResult
}

export const isValidTagFilter = async (filter: string) => {
  const posts = await getCollection("blog")
  const tagPostMap = initTagPostMap(posts)
  const tagEntries = Array.from(tagPostMap, ([filter]) => filter)

  return tagEntries.some(v => filter === v)
}


let seriesPostMap = new Map<string, Set<T_POST>>()
function initSeriesPostMap(posts: Set<T_POST> | T_POST[]) {
  const init = memoize(() => {
    seriesPostMap = createPostMap(posts, (p) =>
      p.data.series?.slug ? [p.data.series.slug] : []
    )
    return seriesPostMap
  }, { getCacheKey: () => Array.from(posts).length })
  return init()
}

export const getFilterBySeriesPage = async () => {
  const posts = await getCollection("blog")
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
  const posts = await getCollection("blog")
  const tagPostMap = initSeriesPostMap(posts)
  const tagEntries = Array.from(tagPostMap, ([filter]) => filter)

  return tagEntries.some(v => filter === v)
}

export async function mapServerPostToClient(posts: T_POST[]) {
  return await Promise.all(
    posts.map(async (post) => ({
      id: post.id,
      href: `/${post.data.category}/${post.id}`,
      title: await title(post),
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


export function page(filterFn: typeof getFilterByCategoryPage | typeof getFilterBySeriesPage | typeof getFilterByTagPage) {
  return async () => {
    const results = await filterFn();
    type T_RES = typeof results[0];
    type T_PAGED_RES = T_RES & {
      params: (T_RES extends { params: object } ? T_RES["params"] : {}) & {
        page: number;
      };
    }

    const pagedResults: T_PAGED_RES[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.props.posts.length <= POST_COUNT_PER_PAGE) continue; // no need to be paged

      for (let j = POST_COUNT_PER_PAGE; j < result.props.posts.length; j += POST_COUNT_PER_PAGE) {
        pagedResults.push({
          ...result,
          params: {
            ...result.params,
            page: Math.floor(j / POST_COUNT_PER_PAGE)
          },
          props: {
            posts: result.props.posts.slice(j, j + POST_COUNT_PER_PAGE)
          }
        })
      }
    }

    return pagedResults;
  }
}

function createPostMap(posts: Set<T_POST> | T_POST[], filterFn: (p: T_POST) => string[]) {
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

function sortPostsByDate(posts: T_POST[]) {
  return posts.toSorted((p1, p2) => {
    const d1 = new Date(date(p1))
    const d2 = new Date(date(p2))
    return d1 > d2 ? -1 : 1
  })
}