import { remark } from "remark"
import strip from "strip-markdown"
import { getEntry, render, type CollectionEntry } from "astro:content"

type T_POST = CollectionEntry<"blog">

export async function title(post: T_POST) {
  const entry = await getEntry("blog", post.id)
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
