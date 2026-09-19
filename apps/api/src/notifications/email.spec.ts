import { describe, expect, it, vi } from "vitest";
import {
  EmailRefusedError,
  EmailSender,
  type EmailProvider,
  isUndeliverableAddress,
} from "./email";

const message = (to: string) => ({ to, subject: "s", text: "t" });

describe("EmailSender", () => {
  it.each([
    "user-1@phone.readi.invalid",
    "SOMEONE@Example.INVALID",
    "a@invalid",
    "a@b.invalid.",
    " padded@x.invalid ",
  ])("refuses to send to %s and never calls the provider", async (to) => {
    const deliver = vi.fn(() => Promise.resolve());
    const provider: EmailProvider = { deliver };

    await expect(new EmailSender(provider).send(message(to))).rejects.toBeInstanceOf(
      EmailRefusedError,
    );
    expect(deliver).not.toHaveBeenCalled();
  });

  it.each(["amaka@example.com", "dev@invalid-domain.com", "x@notinvalid.ng"])(
    "delivers to %s",
    async (to) => {
      const deliver = vi.fn((_message: unknown) => Promise.resolve());
      const provider: EmailProvider = { deliver };

      await new EmailSender(provider).send(message(to));

      expect(deliver).toHaveBeenCalledWith(message(to));
    },
  );

  it("classifies addresses", () => {
    expect(isUndeliverableAddress("user-1@phone.readi.invalid")).toBe(true);
    expect(isUndeliverableAddress("user@readi.ng")).toBe(false);
  });
});
