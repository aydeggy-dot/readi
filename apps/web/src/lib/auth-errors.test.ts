import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import { describeAuthError } from "./auth-errors";

describe("describeAuthError", () => {
  it("maps rate limiting by status, whatever the code", () => {
    expect(describeAuthError({ status: 429, code: "ANYTHING" })).toEqual({
      message: t("common.errors.rateLimited"),
    });
  });

  it("attaches field errors to the right field", () => {
    expect(
      describeAuthError({ status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }).field,
    ).toBe("email");
    expect(describeAuthError({ status: 400, code: "PASSWORD_TOO_SHORT" })).toEqual({
      message: "Use at least 10 characters.",
      field: "password",
    });
    expect(describeAuthError({ status: 400, code: "INVALID_OTP" }).field).toBe("code");
    expect(describeAuthError({ status: 400, code: "INVALID_PHONE_NUMBER" }).field).toBe(
      "phoneNumber",
    );
  });

  it("reports network failures (status 0) as connection problems", () => {
    expect(describeAuthError({ status: 0 }).message).toBe(t("common.errors.network"));
  });

  it("never shows the server's English message for unknown errors", () => {
    expect(describeAuthError({ status: 500, code: "SOMETHING_NEW" })).toEqual({
      message: t("common.errors.generic"),
    });
    expect(describeAuthError(undefined).message).toBe(t("common.errors.generic"));
  });

  it("does not reveal whether an email is registered on failed log-in", () => {
    expect(
      describeAuthError({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" }).field,
    ).toBeUndefined();
  });

  it("explains a sign-in to an account awaiting deletion, with the support address", () => {
    const { message, field } = describeAuthError({ status: 403, code: "ACCOUNT_DELETION_PENDING" });
    expect(message).toMatch(/scheduled for deletion/);
    expect(message).toContain("@");
    expect(field).toBeUndefined();
  });
});
