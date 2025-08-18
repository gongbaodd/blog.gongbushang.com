import { AutoRouter, cors, png, StatusError } from 'itty-router';

const { preflight, corsify } = cors();
const router = AutoRouter({
	before: [preflight],
	finally: [corsify],
});

const ALL_INDEXED = "__ALL__";

router
	.get('/healthcheck', () => {
		return { status: 'OK' };
	})
	.get("/pv/all", async (...args) => {
		const env = Reflect.get(args, 1) as unknown as Env
		const all = JSON.parse((await env.VISIT_COUNT.get(ALL_INDEXED)) ?? "{}") as Record<string, number>;
		return all;
	})
	.get('/:slug/count', async (...args) => {
		const [{ params }] = args
		const env = Reflect.get(args, 1) as unknown as Env

		const slug = params.slug;
		let count = await env.VISIT_COUNT.get(slug);
		const newCount = count ? parseInt(count) + 1 : 1;
		await env.VISIT_COUNT.put(slug, newCount.toString());

		const all = JSON.parse((await env.VISIT_COUNT.get(ALL_INDEXED)) ?? "{}") as Record<string, number>;
		all[slug] = newCount;
		await env.VISIT_COUNT.put(ALL_INDEXED, JSON.stringify(all));

		const transparentPNG = base64ToUint8Array(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgW2aQO8AAAAASUVORK5CYII='
		);
		return png(transparentPNG)
	})
	.get('/:slug/pv', async (...args) => {
		const [{ params }] = args
		const env = Reflect.get(args, 1) as unknown as Env
		const slug = params.slug;
		const _count = await env.VISIT_COUNT.get(slug);
		const count = _count ? parseInt(_count) : 0;
		return { slug, count };
	})
	.all('*', () => {
		throw new StatusError(404, 'Page not found');
	});

export default {
	fetch(req: Request, env: Env, ctx: ExecutionContext) {
		return router.fetch(req, env, ctx);
	},
};

function base64ToUint8Array(base64: string) {
	const binary = Buffer.from(base64, 'base64').toString('binary');
	const len = binary.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
