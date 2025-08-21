import { PV_URL, ROUTES } from "@/packages/consts";
import { atom, computed } from "nanostores";
import { debounce, throttle } from "es-toolkit"

export const $pvMap = atom<Record<string, number>>({})

export const $pvText = computed($pvMap, obj => {
    const result: Record<string, string> = {}

    for (const [k, v] of Object.entries(obj)) {
        result[k] = v > 10000 ? "9k+" : v > 1000 ? v / 1000 + "k" : v.toString()
    }

    return result
})

type T_Hits = {
    count: number,
    path: string,
}

interface IRespond {
    hits: T_Hits[]
}

let pvPromise: null | Promise<void> = null

async function _pvRequest() {
    const pvUrl = PV_URL + "pv"
    const data = await fetch(pvUrl)
    const result = await data.json() as IRespond
    const { hits } = result

    if (hits && hits.length) {
        const pvMap = hits.reduce((sum, hit) => ({ ...sum, [hit.path]: hit.count }), {})
        $pvMap.set(pvMap)
    }
}

export async function requestAllViewCount() {
    if (null == pvPromise) {
        pvPromise = _pvRequest()
        await pvPromise
        pvPromise = null
    }
}
