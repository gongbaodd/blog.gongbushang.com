import { remark } from "remark"
import strip from "strip-markdown"
import { type CollectionEntry } from "astro:content"

type T_POST = CollectionEntry<"blog">

export function title(post: T_POST) {
  if (post.body) {
    const lines = post.body.split("\n")
    for (const line of lines) {
      if (line && line.startsWith("#")) {
        const t = line.replace("#", "").trim()
        if (t) return t
      }
    }
  } 

  const lastIndex = post.id?.lastIndexOf('/')

  if (!post.id || lastIndex === -1) throw new Error("Not a valid post!")

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
