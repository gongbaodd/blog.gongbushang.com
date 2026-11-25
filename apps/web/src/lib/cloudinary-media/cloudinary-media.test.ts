import { describe, expect, it, vi } from "vitest";
import { createCloudinaryProvider } from "./provider";
import {
  buildDestroyRequest,
  buildUploadRequest,
  deliveryUrl,
  escapeContextValue,
  signParams,
  stringToSign,
} from "./sign";

const creds = { cloudName: "demo", apiKey: "key123", apiSecret: "sekret" };
const env = (n: string) =>
  ({
    CLOUDINARY_CLOUD_NAME: "demo",
    CLOUDINARY_API_KEY: "key123",
    CLOUDINARY_API_SECRET: "sekret",
  })[n];

describe("signing", () => {
  it("sorts params, drops file/api_key/cloud_name/resource_type and empties", () => {
    expect(
      stringToSign({
        timestamp: 1,
        folder: "f",
        file: "x",
        api_key: "k",
        cloud_name: "c",
        resource_type: "image",
        context: undefined,
        e: "",
      }),
    ).toBe("folder=f&timestamp=1");
  });
  it("matches an independent SHA-1 (node crypto) of the documented example string", async () => {
    // docs: timestamp=1315060510, public_id=sample, eager=w_400,h_300,c_pad|w_260,h_200,c_crop, secret abcd
    const sig = await signParams(
      { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample", timestamp: 1315060510 },
      "abcd",
    );
    expect(sig).toBe("7e775a49f317e77d8f0af0fb11891b6e6edf21c0");
  });
  it("escapes context values", () => {
    expect(escapeContextValue("a=b|c")).toBe("a\\=b\\|c");
  });
});

describe("request building", () => {
  it("builds a signed multipart upload", async () => {
    const { url, init } = await buildUploadRequest(creds, {
      file: new Blob(["x"], { type: "image/png" }),
      filename: "a.png",
      folder: "growgen-spike",
      alt: "hi",
      timestamp: 100,
    });
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/auto/upload");
    const form = init.body as FormData;
    expect(form.get("folder")).toBe("growgen-spike");
    expect(form.get("api_key")).toBe("key123");
    expect(form.get("context")).toBe("alt=hi");
    const expected = await signParams(
      {
        context: "alt=hi",
        folder: "growgen-spike",
        timestamp: 100,
        unique_filename: true,
        use_filename: true,
      },
      "sekret",
    );
    expect(form.get("signature")).toBe(expected);
    expect(form.has("api_secret")).toBe(false);
  });
  it("builds a signed destroy", async () => {
    const { url, init } = await buildDestroyRequest(creds, "growgen/a", 5);
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/image/destroy");
    const body = init.body as URLSearchParams;
    expect(body.get("public_id")).toBe("growgen/a");
    expect(body.get("signature")).toBe(
      await signParams({ public_id: "growgen/a", timestamp: 5, invalidate: true }, "sekret"),
    );
  });
  it("builds delivery urls", () => {
    expect(deliveryUrl("demo", "g/a")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/g/a",
    );
    expect(deliveryUrl("demo", "g/a", { width: 400 })).toContain("c_fill,w_400,f_auto,q_auto");
  });
});

describe("provider", () => {
  it("lists with basic auth and folder prefix", async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            resources: [
              {
                public_id: "growgen/a",
                format: "png",
                resource_type: "image",
                bytes: 3,
                width: 2,
                height: 2,
              },
            ],
            next_cursor: "n",
          }),
        ),
    );
    const p = createCloudinaryProvider({}, env, f as unknown as typeof fetch);
    const r = await p.list({ limit: 5, cursor: "c" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/v1_1/demo/resources/image/upload?");
    expect(url).toContain("prefix=growgen%2F");
    expect(url).toContain("next_cursor=c");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("key123:sekret")}`,
    );
    expect(r.nextCursor).toBe("n");
    expect(r.items[0]).toMatchObject({ id: "growgen/a", mimeType: "image/png" });
  });
  it("uploads and deletes", async () => {
    const f = vi.fn(
      async (u: string) =>
        new Response(
          JSON.stringify(
            u.includes("destroy")
              ? { result: "ok" }
              : { public_id: "growgen/a", format: "png", resource_type: "image" },
          ),
        ),
    );
    const p = createCloudinaryProvider({}, env, f as unknown as typeof fetch, () => 1);
    const item = await p.upload!({
      file: new File(["x"], "a.png", { type: "image/png" }),
      filename: "a.png",
    });
    expect(item.id).toBe("growgen/a");
    await p.delete!("growgen/a");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("throws a clear error when env is missing and get() returns null on 404", async () => {
    const p = createCloudinaryProvider({}, () => undefined);
    await expect(p.list({})).rejects.toThrow(/CLOUDINARY_CLOUD_NAME/);
    const p2 = createCloudinaryProvider(
      {},
      env,
      (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    );
    expect(await p2.get!("x")).toBeNull();
  });
  it("embeds with transforms", async () => {
    const p = createCloudinaryProvider({}, env);
    const e = (await p.getEmbed({ id: "growgen/a", width: 10, height: 5 }, { width: 800 })) as {
      src: string;
    };
    expect(e.src).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_800,f_auto,q_auto/growgen/a",
    );
  });
});
