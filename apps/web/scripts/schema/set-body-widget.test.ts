import { describe, expect, it } from "vitest";
import { isLoopback, planWidgetChange, WIDGET } from "./set-body-widget.mjs";

describe("set-body-widget (GON-249)", () => {
	it("sets the widget when the field has none, and is a no-op once set", () => {
		expect(planWidgetChange(undefined)).toEqual({ action: "update", target: WIDGET, from: null });
		expect(planWidgetChange(WIDGET)).toEqual({ action: "none", target: WIDGET });
	});

	it("reverts to the default textarea", () => {
		expect(planWidgetChange(WIDGET, { revert: true })).toEqual({ action: "update", target: null, from: WIDGET });
		expect(planWidgetChange(null, { revert: true })).toEqual({ action: "none", target: null });
	});

	it("treats only loopback URLs as local", () => {
		for (const url of ["http://localhost:4322", "http://127.0.0.1", "http://[::1]:4322/"]) expect(isLoopback(url)).toBe(true);
		for (const url of ["https://admin.growgen.xyz", "http://localhost.evil.com", "http://127.0.0.1.nip.io"]) expect(isLoopback(url)).toBe(false);
	});
});
