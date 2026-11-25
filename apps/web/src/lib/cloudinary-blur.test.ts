import { describe, expect, it } from "vitest";
import { blurredCloudinaryUrl } from "./cloudinary";

describe("blurredCloudinaryUrl (hero fallback for placeholder traces)", () => {
  it("prepends a tiny blur transform to a Cloudinary delivery URL", () => {
    expect(blurredCloudinaryUrl("https://res.cloudinary.com/x/image/upload/v1/a/b.jpg")).toBe(
      "https://res.cloudinary.com/x/image/upload/w_48,e_blur:1000,q_auto:low,f_auto/v1/a/b.jpg",
    );
  });
  it("keeps existing transforms and the query string", () => {
    expect(blurredCloudinaryUrl("https://res.cloudinary.com/x/image/upload/a_-90/v1/b.jpg?x=1")).toBe(
      "https://res.cloudinary.com/x/image/upload/w_48,e_blur:1000,q_auto:low,f_auto/a_-90/v1/b.jpg?x=1",
    );
  });
  it("returns undefined for non-Cloudinary input", () => {
    expect(blurredCloudinaryUrl("https://example.com/a.jpg")).toBeUndefined();
  });
});
