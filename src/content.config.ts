import { glob } from 'astro/loaders';
import { defineCollection, z, type BaseSchema, type SchemaContext } from 'astro:content';

const schema: (ctx: SchemaContext) => BaseSchema = ({ image }) => z.object({
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
});

const blog = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/_docs" }),
	schema
});


export const collections = { blog };

