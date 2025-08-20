import { AutoRouter, cors, png, StatusError } from 'itty-router';

const { preflight, corsify } = cors();
const router = AutoRouter({
	before: [preflight],
	finally: [corsify],
});

router
	.get('/healthcheck',  async (...args) => {
		const env = Reflect.get(args, 1) as unknown as Env
		const url = env.GOAT_COUNTER_HOST + "/api/v0/me"
		const token = env.GOAT_COUNTER_TOKEN
		const res = await fetch(url, {
			method: "GET",
			headers: {
				"content-type": "application/json",
				"authorization": `Bearer ${token}`
			}
		})
		const result = await res.json()
		return result
	})
	.get("/pv", async (...args) => {
		const env = Reflect.get(args, 1) as unknown as Env
		const url = env.GOAT_COUNTER_HOST + "/api/v0/stats/hits"
		const token = env.GOAT_COUNTER_TOKEN
		const res = await fetch(url, {
			method: "GET",
			headers: {
				"content-type": "application/json",
				"authorization": `Bearer ${token}`
			}
		})
		const result = await res.json()
		return result;
	})
	.all('*', () => {
		throw new StatusError(404, 'Page not found');
	});

export default {
	fetch(req: Request, env: Env, ctx: ExecutionContext) {
		return router.fetch(req, env, ctx);
	},
};
