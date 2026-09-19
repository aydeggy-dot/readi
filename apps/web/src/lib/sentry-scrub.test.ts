import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("removes the request body, cookies and secret headers", () => {
    const event = scrubSentryEvent({
      request: {
        url: "http://localhost:3002/api/me/cv/parsed",
        data: { skills: ["a CV the candidate uploaded"] },
        cookies: { "readi.session_token": "token" },
        headers: { Cookie: "readi.session_token=token", "X-Readi-Proxy-Secret": "secret" },
      },
    });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({});
    expect(event.request?.url).toBe("http://localhost:3002/api/me/cv/parsed");
  });

  it("leaves an event without a request alone", () => {
    const event = { request: undefined, level: "error" };
    expect(scrubSentryEvent(event)).toEqual({ request: undefined, level: "error" });
  });
});
