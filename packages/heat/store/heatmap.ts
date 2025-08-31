import dayjs from "dayjs";
import { atom } from "nanostores";

export interface IHeatResult {
    heatData: Record<string, number>
    countsMap: Record<string, number>
    currentYear: string
}

export const $heatmap = atom<IHeatResult["heatData"]>({}) 
export const $countsMap = atom<IHeatResult["countsMap"]>({})
export const $currentYear = atom<IHeatResult["currentYear"]>(dayjs().format("YYYY"))

export async function requestHeatData() {
    const url = "/api/heatmap/all.json"
    const response = await fetch(url)
    const result = await response.json() as IHeatResult

    $heatmap.set(result.heatData)
    $countsMap.set(result.countsMap)
    $currentYear.set(result.currentYear)
}
