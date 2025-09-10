import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute<{}>  = async context => {
  const blog = await getCollection('blog');
  return rss({
    title: 'GrowGen | 给我整',
    description: 'A humble Astronaut’s guide to the stars',
    site: context.site!,
    items: blog.map((post) => ({
      // title: post.data.title,
      // pubDate: post.data.pubDate,
      // description: post.data.description,
      // link: `/blog/${post.id}/`,
    })),
  });
}