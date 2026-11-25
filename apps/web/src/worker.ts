import handler, {
  createScheduledHandler,
  EmDashRoom,
  EmDashRoomSite,
  PluginBridge,
} from "@emdash-cms/cloudflare/worker";
import { createWorkerFetch, type StaticWorkerEnv } from "./lib/lockdown";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

const workerFetch = createWorkerFetch({
  isDev: import.meta.env.DEV,
  fallbackFetch: (request, env, ctx) =>
    handler.fetch!(request as never, env as never, ctx as never),
});

export default {
  ...handler,
  // D12 (INF-7) & SEC-04: deployed Workers are fail-closed static-only; EmDash `handler.fetch`
  // only runs in local `astro dev` (`pnpm admin:*`). Cron (`scheduled`) stays active.
  fetch(request, env, ctx) {
    return workerFetch(request, env as StaticWorkerEnv, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
