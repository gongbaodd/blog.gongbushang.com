import { date } from "@/packages/utils/extract";
import { getAllPostByDateDesc, initYearMonthPostMap } from "@/packages/utils/filter";
import { mapServerPostToClient, type T_PROPS } from "@/packages/utils/post";
import type { APIRoute } from "astro";
import dayjs from "dayjs";

type T_POST = T_PROPS;

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const _posts = await getAllPostByDateDesc();

    const buildYear = dayjs().format("YYYY");
    const buildMonth = dayjs().format("MM");
    const buildDay = dayjs().format("DD");
    const monthPostMap = initYearMonthPostMap(_posts);

    const sameMonthPosts: T_POST[] = [];

    for (const [yearMonth, postsSet] of monthPostMap) {
        const [_year, month] = yearMonth.split("-");

        if (_year === buildYear) continue;

        if (month === buildMonth) {
            sameMonthPosts.push(...Array.from(postsSet));
        }
    }

    const postsWithDayProximity = sameMonthPosts.map((post) => {
        const postDate = dayjs(date(post));
        const postDay = postDate.format("DD");
        const dayDiff = Math.abs(parseInt(postDay) - parseInt(buildDay));

        return {
            post,
            dayDiff,
            postDay: parseInt(postDay),
        };
    });

    const sortedByDayProximity = postsWithDayProximity.sort((a, b) => {
        if (a.dayDiff !== b.dayDiff) {
            return a.dayDiff - b.dayDiff;
        }
        return a.postDay - b.postDay;
    });

    const selectedMonthPosts = sortedByDayProximity
        .slice(0, 5)
        .map((item) => item.post);
    let posts = await mapServerPostToClient(selectedMonthPosts)
    const hPostWithCover = posts.filter(p => p.data.cover).sort((a, b) => Number(a.date) - Number(b.date))
    const hPostNoCover = posts.filter(p => !p.data.cover).sort((a, b) => Number(a.date) - Number(b.date))
    posts = [...hPostWithCover, ...hPostNoCover]

    return new Response(JSON.stringify({ posts }))
}