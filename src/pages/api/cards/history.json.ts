import { date } from "@/packages/utils/extract";
import { getAllPostByDateDesc, initYearMonthPostMap } from "@/packages/utils/filter";
import {
  findNearestGalleryEntry,
  parseGalleryDocDate,
} from "@/packages/utils/gallery";
import {
  mapGalleryEntryToClientPost,
  mapServerPostToClient,
  type TClientPost,
  type T_PROPS,
} from "@/packages/utils/post";
import type { APIRoute } from "astro";
import dayjs from "dayjs";

type T_POST = T_PROPS;

export const prerender = true;

export const GET: APIRoute<T_PROPS> = async () => {
    const _posts = await getAllPostByDateDesc();

    const now = dayjs();
    const buildYear = now.format("YYYY");
    const buildMonth = now.format("MM");
    const buildDay = now.format("DD");
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
    const sortByDateAsc = (a: TClientPost, b: TClientPost) => Number(a.date) - Number(b.date)
    const isPodcast = (p: TClientPost) => p.data.category === "podcast"
    const hPostWithCover = posts.filter(p => p.data.cover).sort(sortByDateAsc)
    const hPostNoCover = posts
        .filter(p => !p.data.cover)
        .sort((a, b) => {
            const podcastOrder = Number(isPodcast(b)) - Number(isPodcast(a))
            if (podcastOrder !== 0) return podcastOrder
            return sortByDateAsc(a, b)
        })
    posts = [...hPostWithCover, ...hPostNoCover]

    const galleryEntry = findNearestGalleryEntry(now.toDate());
    const galleryDocDate = galleryEntry
      ? parseGalleryDocDate(galleryEntry.doc)
      : undefined;
    const isGalleryWithinOneWeek =
      galleryDocDate != null &&
      now.diff(dayjs(galleryDocDate), "day") <= 7;
    const galleryPost =
      galleryEntry && !isGalleryWithinOneWeek
        ? await mapGalleryEntryToClientPost(galleryEntry)
        : undefined;

    if (galleryPost) {
      posts = [
        galleryPost,
        ...posts.filter((p) => p.id !== galleryPost.id),
      ];
    }

    return new Response(JSON.stringify({ posts }))
}