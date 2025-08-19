import dayjs from "dayjs";
import { date as dateFrom } from "./extract";
import { getAllPosts } from "./post";

export async function getHeatmapData() {
    const posts = await getAllPosts()
    const result = posts.map(p => {
        const date = dateFrom(p)
        const key = dayjs(date).format("YYYY-MM-DD")
        const count = p.body?.length ?? 0
        return {key, count} 
    }).reduce((sum, {key, count } ) => {
        return ({
            ...sum,
            [key]: sum[key] ?? 0 + count
        })
    }, {} as Record<string, number>)

    return result
}

export async function getCounts(): Promise<Record<string, number>> {
    const posts = await getAllPosts()
    const counts = posts.reduce((acc, post) => {
        const year = dayjs(dateFrom(post)).format("YYYY")
        acc[year] = (acc[year] ?? 0) + 1
        return acc
    }, {} as Record<string, number>)

    counts.ALL = posts.length
    return counts
}