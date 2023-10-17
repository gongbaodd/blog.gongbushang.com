import { defineCollection, z } from 'astro:content';

const post = defineCollection({
	// Type-check frontmatter using a schema
	schema: z.object({
		type: z.enum(['post', 'draft']),
		category: z.string(),
		tag: z.array(z.string()).optional(),
		series: z.object({
			name: z.string(),
			slug: z.string(),
			number: z.number(),
		}).optional(),
	}),
});

export const collections = { post };
