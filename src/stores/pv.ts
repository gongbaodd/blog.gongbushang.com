import { PV_URL } from "@/packages/consts";
import { atom, computed } from "nanostores";

export const $pv = atom<Record<string, number>>({})

export const $pvText = computed($pv, obj => {
    const result: Record<string, string> = {}

    for (const [k, v] of Object.entries(obj)) {
        result[k] = v > 10000 ? "9k+" : v > 1000 ? v / 1000 + "k" : v.toString()
    }

    return result
})

export async function requestViewCount(slug: string) {
    const pvUrl = PV_URL + slug + "/pv"
    const data = await fetch(pvUrl)
    const { count } = await data.json() as { slug: string, count: number }
    $pv.set({
        ...$pv.get(),
        [slug]: count
    })
}