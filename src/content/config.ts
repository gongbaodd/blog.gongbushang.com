import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	// Type-check frontmatter using a schema
	schema: z.object({
		type: z.enum(['post', 'draft']),
		category: z.string(),
		tag: z.array(z.string()).optional(),
		series: z.object({
			slug: z.string(),
			name: z.string().optional(),
			number: z.number().optional(),
		}).optional(),
	}),
});

export const collections = { blog };
