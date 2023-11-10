import { remark } from "remark"
import strip from "strip-markdown"
import { type CollectionEntry } from "astro:content"

type T_POST = CollectionEntry<"blog">

export function title(post: T_POST) {
  const lines = post.body.split("\n")
  for (const line of lines) {
    if (line) return line.replace("#", "")
  }

  if (!post.slug) throw new Error("Not a valid post!")

  return post.slug
}

export function date(post: { slug: string }) {
  const info = post.slug.split("/")
  const date = new Date(
    parseInt(info[0], 10),
    parseInt(info[1], 10) - 1,
    parseInt(info[2], 10)
  )
  return date
}

export async function excerpt(post: { body: string }, words = 120) {
  const content = post.body.replace(/#.*/, "")
  const doc = await remark().use(strip).process(content)
  return String(doc).slice(0, words) + "..."
}
