import { getSeries } from "@/packages/utils/badges";
import type { TLink } from "@/packages/utils/extract";

export const prerender = true;

export const GET = async () => {
    const links: TLink[] = await getSeries();

    return new Response(JSON.stringify({ links }), {
        headers: {
            'Content-Type': 'application/json',
        },
        status: 200,
    })
}