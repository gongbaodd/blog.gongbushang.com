import removeMarkdown from "markdown-to-text"


export function title(post: { body: string, slug: string }) {
    const lines = post.body.split('\n')
    for(const line of lines) {
        if (line) return line.replace('#', '')
    }

    if (!post.slug) throw new Error("Not a valid post!")

    return post.slug
}

export function date(post: {slug: string}) {
    const info = post.slug.split('/')
    const date = new Date(
        parseInt(info[0], 10),
        parseInt(info[1], 10) - 1, 
        parseInt(info[2], 10)
    )
    return date
}

export function excerpt(post: {body: string}, words = 120) {
    const content = post.body.replace(/#.*/, "")
    
    return  removeMarkdown(content).slice(0, words) + "...";
}