import { AutoRouter, cors, png, StatusError } from 'itty-router';

const { preflight, corsify } = cors();
const router = AutoRouter({
	before: [preflight],
	finally: [corsify],
});

router
	.get('/healthcheck', () => {
		return { status: 'OK' };
	})
	.get('/:slug/count', async ({ params }, env) => {
		const slug = params.slug;
		let count = await env.VISIT_COUNT.get(slug);
		count = count ? parseInt(count) + 1 : 1;
		await env.VISIT_COUNT.put(slug, count.toString());
		const transparentPNG = base64ToUint8Array(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgW2aQO8AAAAASUVORK5CYII='
		);
		return png(transparentPNG)
	})
	.get('/:slug/pv', async ({ params }, env) => {
		const slug = params.slug;
		let count = await env.VISIT_COUNT.get(slug);
		count = count ? parseInt(count) : 0;
		return { slug, count };
	})
	.all('*', () => {
		throw new StatusError(404, 'Page not found');
	});

export default {
	fetch(req, env, ctx) {
		return router.fetch(req, env, ctx);
	},
};

function base64ToUint8Array(base64) {
	const binary = Buffer.from(base64, 'base64').toString('binary');
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
