import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getAllClientPostsForSearch } from '@/packages/utils/post';
// @ts-ignore
import { body } from "@/packages/hero/fragments/description.mdx";

export const GET: APIRoute<{}> = async context => {
  const posts = await getAllClientPostsForSearch();
  
  return rss({
    title: 'GrowGen | 给我整',
    description: body,
    site: context.site!,
    items: posts.map((post) => ({
      title: post.title,
      pubDate: post.date,
      description: post.content.substring(0, 200) + '...', // First 200 characters as description
      link: post.href,
    })),
  });
}