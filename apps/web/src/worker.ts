import handler, {
  createScheduledHandler,
  EmDashRoom,
  EmDashRoomSite,
  PluginBridge,
} from "@emdash-cms/cloudflare/worker";
import { isLockedPath } from "./lib/lockdown";

export { EmDashRoom, EmDashRoomSite, PluginBridge };

export default {
  ...handler,
  // D12 (INF-7): the admin runs locally; a deployed Worker serves static pages only. `astro dev` (DEV) is unaffected.
  async fetch(request, env, ctx) {
    if (!import.meta.env.DEV && isLockedPath(new URL(request.url).pathname)) {
      return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
    }
    return handler.fetch!(request as never, env as never, ctx);
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler;
