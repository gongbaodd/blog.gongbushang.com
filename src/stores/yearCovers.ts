import { atom } from "nanostores"

export type TCovers = Record<string, (string | undefined)[]>
export type TColors = Record<string, string>
export interface ICoverResult {
    covers: TCovers;
    colors: TColors;
}

export const $covers = atom<TCovers>({})
export const $colors = atom<TColors>({})


export async function requestCovers() {
    const url = "/api/year/covers.json"
    const response = await fetch(url)
    const data = await response.json() as ICoverResult
    $covers.set(data.covers)
    $colors.set(data.colors)
}