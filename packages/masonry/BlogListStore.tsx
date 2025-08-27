import { useEffect } from "react";
import type { FILTER_ENTRY } from "@/packages/consts";
import type { TLink } from "@/packages/utils/extract";
import type { IPost } from "@/packages/card/PostCard";
import { $posts, $postsListParams } from "@/src/stores/posts";
import { $category, $series, $tag } from "@/src/stores/links";

interface IStoreProps {
    posts: IPost[];
    categories: TLink[];
    tags: TLink[];
    series: TLink[];
    filter: string;
    entryType?: FILTER_ENTRY;
    totalCount: number;
}

export function BlogListNanoStore({
    posts,
    categories,
    tags,
    series,
    filter,
    entryType,
    totalCount,
}: IStoreProps) {
    useEffect(() => {
        $posts.set(posts);
        $category.set(categories);
        $tag.set(tags)
        $series.set(series)
        $postsListParams.set({ filter, entryType, page: 0, totalCount });
    }, []);

    return <></>;
}