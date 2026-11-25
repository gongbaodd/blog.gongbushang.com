import { describe, expect, it } from "vitest";
import { ALL_ROUTE_HREF, ROUTES, ROUTE_HREF, ROUTE_LABEL } from "../consts";
import { $pathname, $pathnameNormalized } from "./store/pathname";
import { mantineGlobalClasses } from "../utils/mantine-classes";

describe("site shell", () => {
  it("keeps the legacy nav routes", () => {
    expect(ROUTES.map((r) => r.href)).toEqual(["/", "/all", "/lab", "/world", "/year"]);
    expect(ALL_ROUTE_HREF).toHaveLength(5);
    expect(ROUTES[1]).toEqual({ label: ROUTE_LABEL.Blog, href: ROUTE_HREF.Blog });
  });

  it("normalizes trailing slashes in the pathname store", () => {
    $pathname.set("/year/");
    expect($pathnameNormalized.get()).toBe("/year");
    $pathname.set("/");
    expect($pathnameNormalized.get()).toBe("/");
  });

  it("emits Mantine responsive helper classes", () => {
    const css = mantineGlobalClasses();
    expect(css).toContain(".mantine-visible-from-md");
    expect(css).toContain(".mantine-hidden-from-md");
  });
});
