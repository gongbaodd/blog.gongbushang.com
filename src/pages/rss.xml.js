import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';

export async function GET(context) {
	const posts = await getCollection('blog');
	const options = {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			// ...post.data,
			title: "TODO",
			pubDate: new Date(),		
			link: `/blog/${post.slug}/`,
		})),
	}

	return rss(options);
}
