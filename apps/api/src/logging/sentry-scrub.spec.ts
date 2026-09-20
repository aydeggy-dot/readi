import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("removes the request body, cookies and secret headers", () => {
    const event = scrubSentryEvent({
      request: {
        url: "http://localhost/api/auth/sign-in/email",
        method: "POST",
        data: { email: "ada@example.com", password: "correct horse battery staple" },
        cookies: { "readi.session_token": "token" },
        headers: {
          "Content-Type": "application/json",
          Cookie: "readi.session_token=token",
          "X-Readi-Proxy-Secret": "secret",
          "x-readi-client-ip": "102.89.1.1",
          authorization: "Bearer token",
        },
      },
    });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({ "Content-Type": "application/json" });
    // Non-personal context is kept, so the event is still useful.
    expect(event.request?.url).toBe("http://localhost/api/auth/sign-in/email");
  });

  it("leaves an event without a request alone", () => {
    const event = { request: undefined, level: "error" };
    expect(scrubSentryEvent(event)).toEqual({ request: undefined, level: "error" });
  });
});
