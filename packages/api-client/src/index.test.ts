import { describe, expect, it } from "vitest";
import { createApiClient, errorCode, invalidFields } from "./index.js";

describe("createApiClient", () => {
  it("calls the API with typed paths and a same-origin base URL by default", async () => {
    const requests: Request[] = [];
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: (input: Request) => {
        requests.push(input);
        return Promise.resolve(Response.json({ google: true }));
      },
    });
    const { data } = await client.GET("/api/auth-methods");
    expect(data).toEqual({ google: true });
    expect(requests[0]?.url).toBe("http://api.test/api/auth-methods");
  });
});

describe("error helpers", () => {
  it("reads the error code", () => {
    expect(errorCode({ statusCode: 409, code: "profile_required", message: "x" })).toBe(
      "profile_required",
    );
    expect(errorCode({ message: "x" })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });

  it("lists invalid top-level fields once each", () => {
    const body = {
      statusCode: 400,
      message: "Validation failed",
      errors: [
        { path: ["stack", 1], message: "too short" },
        { path: ["stack", 2], message: "too short" },
        { path: ["name"], message: "required" },
        { path: [], message: "bad" },
      ],
    };
    expect(invalidFields(body)).toEqual(["stack", "name"]);
    expect(invalidFields({ message: "x" })).toEqual([]);
  });
});
