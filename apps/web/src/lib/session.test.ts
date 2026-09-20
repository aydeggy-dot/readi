import type { MeResponse } from "@readi/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(new Headers()) }));

const get = vi.fn();
vi.mock("@readi/api-client", () => ({ createApiClient: () => ({ GET: get }) }));

const { getMe, requireAdmin, requireOnboarded, requireUser } = await import("./session");

const me = (overrides: Partial<MeResponse> = {}): MeResponse => ({
  id: "8d3f9c2e-4b1a-4c7e-9f00-1a2b3c4d5e6f",
  name: "Ada",
  role: "candidate",
  email: "ada@example.com",
  email_verified: true,
  phone_number: null,
  phone_number_verified: false,
  signup_method: "email",
  onboarding: {
    profile_completed: true,
    consents_completed: true,
    completed_at: "2026-09-19T10:00:00.000Z",
  },
  ...overrides,
});

/** What `GET /api/me` answers for this test. */
const answers = (body: MeResponse | null, status = body ? 200 : 401) => {
  get.mockResolvedValue({ data: body ?? undefined, response: { status } });
};

describe("server-side session helpers (ADR-0012)", () => {
  beforeEach(() => {
    // getMe is request-cached; each test needs its own module-level cache entry cleared.
    vi.mocked(get).mockReset();
  });

  it("returns null rather than throwing when nobody is signed in", async () => {
    answers(null);
    await expect(getMe()).resolves.toBeNull();
  });

  it("sends a signed-out visitor to log in", async () => {
    answers(null);
    await expect(requireUser()).rejects.toThrow("REDIRECT:/login");
  });

  it("surfaces an API failure instead of treating it as signed out", async () => {
    get.mockResolvedValue({ data: undefined, response: { status: 503 } });
    await expect(requireUser()).rejects.toThrow(/HTTP 503/);
  });

  it("sends a half-onboarded user to the step they still owe", async () => {
    answers(
      me({
        onboarding: { profile_completed: false, consents_completed: false, completed_at: null },
      }),
    );
    await expect(requireOnboarded()).rejects.toThrow("REDIRECT:/onboarding/profile");

    answers(
      me({
        onboarding: { profile_completed: true, consents_completed: false, completed_at: null },
      }),
    );
    await expect(requireOnboarded()).rejects.toThrow("REDIRECT:/onboarding/consent");
  });

  it("lets a finished user through", async () => {
    answers(me());
    await expect(requireOnboarded()).resolves.toMatchObject({ name: "Ada" });
  });

  it("answers 404 on admin pages for everyone else, rather than 403", async () => {
    answers(me({ role: "candidate" }));
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    answers(me({ role: "admin" }));
    await expect(requireAdmin()).resolves.toMatchObject({ role: "admin" });
  });
});
