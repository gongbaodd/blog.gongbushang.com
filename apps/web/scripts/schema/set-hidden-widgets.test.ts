import { describe, expect, it } from "vitest";
import { FIELDS, isLoopback, planWidgetChange, WIDGET } from "./set-hidden-widgets.mjs";

describe("set-hidden-widgets (GON-269)", () => {
	it("hides exactly the four legacy/seed fields, never more", () => {
		expect(FIELDS).toEqual(["legacy_id", "legacy_date", "content", "excerpt"]);
		expect(WIDGET).toBe("post-fields:hidden");
	});

	it("sets the widget when missing, and is a no-op once set", () => {
		expect(planWidgetChange(undefined)).toEqual({ action: "update", target: WIDGET, from: null });
		expect(planWidgetChange(WIDGET)).toEqual({ action: "none", target: WIDGET });
	});

	it("reverts to the default input", () => {
		expect(planWidgetChange(WIDGET, { revert: true })).toEqual({ action: "update", target: null, from: WIDGET });
		expect(planWidgetChange(null, { revert: true })).toEqual({ action: "none", target: null });
	});

	it("treats only loopback URLs as local", () => {
		expect(isLoopback("http://localhost:4322")).toBe(true);
		expect(isLoopback("https://admin.growgen.xyz")).toBe(false);
	});
});
