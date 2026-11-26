/**
 * GITHUB_DISPATCH_TOKEN expiration reminder (GON-216). The expiry date is configuration (`GITHUB_DISPATCH_TOKEN_EXPIRES_AT`,
 * YYYY-MM-DD), never derived from the token. Only the date and a day count are ever rendered, never the token itself.
 */

export const TOKEN_ROTATE_URL = "https://github.com/settings/personal-access-tokens";
/** Days remaining at or below which the warning state starts. */
export const WARNING_DAYS = 30;
export const TOKEN_NAME = "GITHUB_DISPATCH_TOKEN";

export type TokenExpiryState =
	| { status: "healthy" | "warning" | "expired"; expiresAt: string; daysLeft: number }
	| { status: "unset" };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** Parse a strict YYYY-MM-DD into a UTC day number, or undefined when malformed or not a real calendar date. */
function dayNumber(value: string): number | undefined {
	const m = DATE.exec(value);
	if (!m) return undefined;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const ms = Date.UTC(y, mo - 1, d);
	const date = new Date(ms);
	if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined;
	return ms / DAY_MS;
}

/** Whole UTC calendar days from `now` to the expiry date. The count rolls over at 00:00 UTC, not local time; 0 means it expires today and counts as expired. `now` is injectable. */
export function getTokenExpiryState(expiresAt: string | undefined, now: Date = new Date()): TokenExpiryState {
	const value = expiresAt?.trim();
	if (!value) return { status: "unset" };
	const target = dayNumber(value);
	if (target === undefined) return { status: "unset" };
	const daysLeft = target - Math.floor(now.getTime() / DAY_MS);
	if (daysLeft <= 0) return { status: "expired", expiresAt: value, daysLeft };
	return { status: daysLeft <= WARNING_DAYS ? "warning" : "healthy", expiresAt: value, daysLeft };
}

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function describeTokenExpiry(state: TokenExpiryState): string {
	switch (state.status) {
		case "healthy":
			return `${TOKEN_NAME}: expires ${state.expiresAt} (${plural(state.daysLeft)} left)`;
		case "warning":
			return `⚠️ ${TOKEN_NAME} expires on ${state.expiresAt} (in ${plural(state.daysLeft)})`;
		case "expired":
			return `🚨 ${TOKEN_NAME} expired on ${state.expiresAt}. Publish-triggered rebuilds will fail until ${TOKEN_NAME} (and ${TOKEN_NAME}_EXPIRES_AT) is rotated.`;
		case "unset":
			return `${TOKEN_NAME}_EXPIRES_AT is missing or not a valid YYYY-MM-DD date, so its expiry cannot be tracked.`;
	}
}
