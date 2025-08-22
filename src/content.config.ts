import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
    loader: glob({pattern: "**/*.{md,mdx}", base: "./src/content/_docs"}),
	// Type-check frontmatter using a schema
	schema: ({image}) => z.object({
		type: z.enum(['post', 'draft']),
		category: z.string(),
		tag: z.array(z.string()).optional(),
		series: z.object({
			slug: z.string(),
			name: z.string().optional(),
			number: z.number().optional(),
		}).optional(),
		cover: z.object({
			url: image(),
			alt: z.string(),
		}).optional(),
		city: z.array(z.string()).optional(),
	}),
});

export const collections = { blog };

