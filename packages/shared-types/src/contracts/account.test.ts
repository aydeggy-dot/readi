import { describe, expect, it } from "vitest";
import { DataExport, DeleteAccountRequest } from "./account.js";

const now = "2026-09-19T12:00:00.000Z";

const minimalExport = {
  format_version: 1,
  generated_at: now,
  user: {
    id: "8d3f9c2e-4b1a-4c7e-9f00-1a2b3c4d5e6f",
    name: "",
    email: null,
    email_verified: false,
    phone_number: "+2348031234567",
    phone_number_verified: true,
    role: "candidate",
    signup_method: "phone",
    country: null,
    locale: null,
    created_at: now,
    updated_at: now,
  },
  profile: null,
  cv: {
    status: "none",
    content_type: null,
    uploaded_at: null,
    parsed_at: null,
    edited_at: null,
    error: null,
    parsed: null,
    download_url: null,
    download_url_expires_at: null,
  },
  consents: [],
  linked_accounts: [{ provider: "phone-number", provider_account_id: "x", created_at: now }],
  sessions: [],
  audit_entries: [
    {
      action: "user.deletion.requested",
      actor: "you",
      target_type: "user",
      target_is_you: true,
      before: null,
      after: { deletion_scheduled_for: now },
      created_at: now,
    },
  ],
  ai_processing: [],
};

describe("account contracts", () => {
  it("accepts only the exact confirmation word", () => {
    expect(DeleteAccountRequest.safeParse({ confirmation: "DELETE" }).success).toBe(true);
    for (const confirmation of ["delete", "DELETE ", "", "yes"]) {
      expect(DeleteAccountRequest.safeParse({ confirmation }).success).toBe(false);
    }
  });

  it("accepts an export for a user with no profile or CV", () => {
    expect(DataExport.parse(minimalExport)).toEqual(minimalExport);
  });

  it("does not identify staff in audit entries", () => {
    const entry = {
      ...minimalExport.audit_entries[0],
      actor: "8d3f9c2e-4b1a-4c7e-9f00-1a2b3c4d5e6f",
    };
    expect(DataExport.safeParse({ ...minimalExport, audit_entries: [entry] }).success).toBe(false);
  });
});
