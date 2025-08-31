import { remark } from "remark"
import strip from "strip-markdown"
import { getEntry, render, type CollectionEntry } from "astro:content"
import { getSeries } from "./badges"
import { type T_PROPS } from "./post"
import { BLOG_SOURCE } from "../consts"

type T_POST = T_PROPS

export async function title(post: T_POST) {
  const entry = await getEntry(BLOG_SOURCE, post.id)
  if (!entry) throw new Error("Not a valid post!")

  const { headings } = await render(entry)

  for (const { text } of headings) {
    return text
  }

  const lastIndex = post.id?.lastIndexOf('/')
  return post.id.slice(lastIndex + 1).replace(/-/g, " ")
}

export function date(post: T_POST) {
  const info = post.id.split("/")
  const date = new Date(
    parseInt(info[0], 10),
    parseInt(info[1], 10) - 1,
    parseInt(info[2], 10)
  )
  return date
}

export async function excerpt(post: T_POST, words = 120) {
  if (!post.body) {
    return ""
  }
  const content = post.body.replace(/#.*/, "")
  const doc = await remark().use(strip).process(content)
  return String(doc).slice(0, words) + "..."
}

export type TLink = {
  label: string;
  href: string;
};

export function tags(post: T_POST): TLink[] {
  const { tag } = post.data
  if (!tag) return []

  return tag.map((_t: string) => {
    const t = _t.toLocaleLowerCase()
    return ({
      label: t,
      href: `/tag/${t}`,
    })
  })
}

export function category(post: T_POST): TLink {
  const { category } = post.data
  return {
    label: category,
    href: `/${category}`,
  }
}

export async function series(post: T_POST) {
  const { series } = post.data
  if (!series) return void(0)

  let name = series.name ?? ""
  const href = `/series/${series.slug}`;

  if (!name) {
    const allSeries = await getSeries()
    const series = allSeries.find(s => s.href === href)
    if (series) {
      name = series.label
    }
  }

  return {
    label: name,
    href,
  } satisfies TLink
}
