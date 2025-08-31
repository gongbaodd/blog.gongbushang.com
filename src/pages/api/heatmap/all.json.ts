import type { IHeatResult } from "@/packages/heat/store/heatmap";
import { getCounts, getHeatmapData } from "@/packages/utils/heatmap";
import dayjs from "dayjs";

export const prerender = true;

export const GET = async () => {
    const heatData = await getHeatmapData()
    const countsMap = await getCounts()
    const currentYear = dayjs().format("YYYY")

    return new Response(JSON.stringify({
        heatData,
        countsMap,
        currentYear,
    } as IHeatResult), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 200,
    })
}