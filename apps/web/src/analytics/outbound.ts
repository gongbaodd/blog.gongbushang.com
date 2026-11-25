import { track } from "./index";

let installed = false;

/** Install one delegated capture-phase click listener for outbound links. */
export function installOutboundTracking(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "click",
    (event) => {
      try {
        const target = event.target as Element | null;
        const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
        if (!anchor) return;
        const url = new URL(anchor.href, window.location.href);
        if (!/^https?:$/.test(url.protocol)) return;
        if (url.host === window.location.host) return;
        track("outbound_link_clicked", {
          domain: url.hostname,
          url: `${url.origin}${url.pathname}`,
          from_path: window.location.pathname,
        });
      } catch {
        /* never break navigation */
      }
    },
    true,
  );
}
