import { describe, expect, it } from "vitest";
import { CLIENT_IP, forwardedHeaders, PROXY_SECRET } from "./forwarded-headers";

const secret = "s".repeat(32);

describe("forwardedHeaders", () => {
  it("replaces client-forged values with the edge's client IP and the proxy secret", () => {
    const incoming = new Headers({
      [CLIENT_IP]: "6.6.6.6",
      [PROXY_SECRET]: "forged",
      "cf-connecting-ip": "102.89.1.2",
    });

    const out = forwardedHeaders(incoming, { clientIpHeader: "cf-connecting-ip", secret });

    expect(out.get(CLIENT_IP)).toBe("102.89.1.2");
    expect(out.get(PROXY_SECRET)).toBe(secret);
  });

  it("forwards no client IP when the edge header is absent", () => {
    const out = forwardedHeaders(new Headers({ [CLIENT_IP]: "6.6.6.6" }), {
      clientIpHeader: "cf-connecting-ip",
      secret,
    });

    expect(out.has(CLIENT_IP)).toBe(false);
  });

  it("ignores X-Forwarded-For, which clients control", () => {
    const out = forwardedHeaders(new Headers({ "x-forwarded-for": "6.6.6.6" }), { secret });

    expect(out.has(CLIENT_IP)).toBe(false);
  });

  it("rejects a chain in the edge header", () => {
    const out = forwardedHeaders(new Headers({ "x-real-ip": "1.1.1.1, 2.2.2.2" }), {
      clientIpHeader: "x-real-ip",
      secret,
    });

    expect(out.has(CLIENT_IP)).toBe(false);
  });

  it("sends neither header without a configured secret", () => {
    const out = forwardedHeaders(new Headers({ [CLIENT_IP]: "6.6.6.6", "x-real-ip": "1.1.1.1" }), {
      clientIpHeader: "x-real-ip",
    });

    expect(out.has(CLIENT_IP)).toBe(false);
    expect(out.has(PROXY_SECRET)).toBe(false);
  });
});
