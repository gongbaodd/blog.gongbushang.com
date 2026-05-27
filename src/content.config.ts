import { glob } from 'astro/loaders';
import { defineCollection, type SchemaContext } from 'astro:content';
import { z } from 'astro/zod';

const schema = ({ image }: SchemaContext) =>
	z.object({
		type: z.enum(['post', 'draft']),
		category: z.string(),
		tag: z.array(z.string()).optional(),
		series: z
			.object({
				slug: z.string(),
				name: z.string().optional(),
				number: z.number().optional(),
			})
			.optional(),
		cover: z
			.object({
				url: image(),
				alt: z.string(),
			})
			.optional(),
		city: z.array(z.string()).optional(),
	});

const blog = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/_docs" }),
	schema
});


export const collections = { blog };

