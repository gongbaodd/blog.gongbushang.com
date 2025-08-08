import type { APIRoute } from "astro"
import { getFilteredPage } from "@/packages/utils/filter"

export const getStaticPaths = getFilteredPage

type T_PROPS = Awaited<ReturnType<typeof getStaticPaths>>[0]["props"]

export const GET: APIRoute<T_PROPS> = ({ props }) => {
    return new Response(JSON.stringify(props), {
        headers: { "Content-Type": "application/json" }
    })
}