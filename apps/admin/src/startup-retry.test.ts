import { describe, expect, it, vi } from "vitest";
import { isTransientDbError, retryDelayMs, withDbRetry } from "../scripts/safety.mjs";

const err = (code: string | undefined, message = "boom") => Object.assign(new Error(message), code ? { code } : {});
const noSleep = () => Promise.resolve();

describe("startup DB check retry (GON-274)", () => {
	it("classifies transient and permanent errors", () => {
		expect(isTransientDbError(err("EAI_AGAIN", "getaddrinfo EAI_AGAIN aws-0-ap-southeast-1.pooler.supabase.com"))).toBe(true);
		expect(isTransientDbError(err("ECONNREFUSED"))).toBe(true);
		expect(isTransientDbError(err("57P03"))).toBe(true);
		expect(isTransientDbError(err(undefined, "Connection terminated due to connection timeout"))).toBe(true);
		expect(isTransientDbError(err("28P01", "password authentication failed for user"))).toBe(false);
		expect(isTransientDbError(err("3D000", 'database "x" does not exist'))).toBe(false);
		expect(isTransientDbError(err("SELF_SIGNED_CERT_IN_CHAIN"))).toBe(false);
		expect(isTransientDbError(undefined)).toBe(false);
	});

	it("backs off 1s, 2s, 4s, 8s, then caps at 10s", () => {
		expect([1, 2, 3, 4, 5, 6].map((n) => retryDelayMs(n))).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
	});

	it("retries a transient error, then succeeds", async () => {
		const fn = vi.fn().mockRejectedValueOnce(err("EAI_AGAIN")).mockRejectedValueOnce(err("ETIMEDOUT")).mockResolvedValue("row");
		const onRetry = vi.fn();
		const sleep = vi.fn(noSleep);
		await expect(withDbRetry(fn, { onRetry, sleep })).resolves.toBe("row");
		expect(fn).toHaveBeenCalledTimes(3);
		expect(onRetry.mock.calls.map((c) => [c[1], c[2]])).toEqual([
			[1, 1000],
			[2, 2000],
		]);
		expect(sleep.mock.calls).toEqual([[1000], [2000]]);
	});

	it("gives up after the last attempt and rethrows the last error", async () => {
		const fn = vi.fn().mockRejectedValue(err("EAI_AGAIN"));
		await expect(withDbRetry(fn, { attempts: 4, sleep: noSleep })).rejects.toMatchObject({ code: "EAI_AGAIN" });
		expect(fn).toHaveBeenCalledTimes(4);
	});

	it("does not retry a permanent error", async () => {
		const fn = vi.fn().mockRejectedValue(err("28P01", "password authentication failed"));
		const onRetry = vi.fn();
		await expect(withDbRetry(fn, { onRetry, sleep: noSleep })).rejects.toMatchObject({ code: "28P01" });
		expect(fn).toHaveBeenCalledTimes(1);
		expect(onRetry).not.toHaveBeenCalled();
	});
});
