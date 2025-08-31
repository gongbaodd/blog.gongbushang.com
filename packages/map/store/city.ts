import { atom } from "nanostores";
import type { IMapData } from "../GLMap";

export const $cities = atom<IMapData[]>([])

export async function requestCitiesData() {
    const url = `/api/city/all.json`
    const response = await fetch(url)
    const result = await response.json() as { data: IMapData[] }
    $cities.set(result.data)
}