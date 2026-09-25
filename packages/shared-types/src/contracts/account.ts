import { z } from "zod";
import { ACCOUNT_DELETION, CONTENT_LIMITS } from "../constants.js";
import { ConsentType } from "./consents.js";
import { CvContentType, CvParseError, CvStatus, ParsedCv } from "./cv.js";
import { TargetCompanyType } from "./profiles.js";
import { Slug } from "./slug.js";
import { Role, SignupMethod } from "./users.js";

/** Body of `POST /api/me/deletion`: the user typed the confirmation word (ADR-0011). */
export const DeleteAccountRequest = z.object({
  confirmation: z.literal(ACCOUNT_DELETION.confirmation),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/** Response body of `POST /api/me/deletion`. The user is signed out everywhere. */
export const DeleteAccountResponse = z.object({
  /** When personal data is erased; until then an admin can cancel the deletion. */
  deletion_scheduled_for: z.iso.datetime(),
});
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponse>;

const ExportUser = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Avatar URL from Google sign-in; null otherwise. */
  image: z.url().nullable(),
  /** Null for phone sign-ups (they have no real email address). */
  email: z.email().nullable(),
  email_verified: z.boolean(),
  phone_number: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  phone_number_verified: z.boolean(),
  role: Role,
  signup_method: SignupMethod,
  /** ISO 3166-1 alpha-2. */
  country: z.string().length(2).nullable(),
  /** BCP 47 language tag. */
  locale: z.string().min(2).max(35).nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

const ExportProfile = z.object({
  target_role: Slug,
  level: Slug,
  target_stack: Slug.nullable(),
  years_experience: z.int().min(0),
  technologies: z.array(z.string()),
  target_company_type: TargetCompanyType,
  target_date: z.iso.date().nullable(),
  onboarding_completed_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});

const ExportCv = z.object({
  status: CvStatus,
  content_type: CvContentType.nullable(),
  uploaded_at: z.iso.datetime().nullable(),
  parsed_at: z.iso.datetime().nullable(),
  edited_at: z.iso.datetime().nullable(),
  error: CvParseError.nullable(),
  parsed: ParsedCv.nullable(),
  /** A short-lived link to the uploaded file itself; null when there is no file. */
  download_url: z.url().nullable(),
  download_url_expires_at: z.iso.datetime().nullable(),
});

const ExportConsent = z.object({
  type: ConsentType,
  granted: z.boolean(),
  /** Version of the consent text the decision was made against. */
  version: z.int().min(1),
  decided_at: z.iso.datetime(),
});

const ExportLinkedAccount = z.object({
  /** "credential" (email and password), "google" or "phone-number". Tokens are never exported. */
  provider: z.string().min(1).max(64),
  /** The provider's id for the account (for Google, the Google account id). */
  provider_account_id: z.string().min(1).max(255),
  created_at: z.iso.datetime(),
});

const ExportSession = z.object({
  created_at: z.iso.datetime(),
  expires_at: z.iso.datetime(),
  ip_address: z.string().min(1).max(64).nullable(),
  user_agent: z.string().min(1).max(512).nullable(),
});

const ExportAuditEntry = z.object({
  action: z.string().min(1).max(100),
  /** Who acted: the user themself, an administrator, or the system. Staff are not identified. */
  actor: z.enum(["you", "admin", "system"]),
  target_type: z.string().min(1).max(50),
  /** Whether the entry is about the user's own account. */
  target_is_you: z.boolean(),
  /** Snapshots hold ids and enum values only (never personal data). */
  before: z.unknown(),
  after: z.unknown(),
  created_at: z.iso.datetime(),
});

/**
 * One line of an interview transcript. The candidate's own words, and the interviewer's.
 */
const ExportInterviewTurn = z.object({
  seq: z.int().min(0),
  speaker: z.enum(["interviewer", "candidate"]),
  question_position: z.int().min(0).nullable(),
  text: z.string(),
  at: z.iso.datetime(),
});

/** A question as it was put to them — the prompt they answered, not the key it was scored by. */
const ExportInterviewQuestion = z.object({
  position: z.int().min(0),
  type: z.string().min(1).max(40),
  topic: z.string().min(1).max(140),
  prompt: z.string().max(CONTENT_LIMITS.questionPromptMaxLength),
  // Constrained, not bare: a nullable string with no constraint becomes an array of strings in the
  // OpenAPI document (`openapi-compat.test.ts`, and the lesson behind it).
  context: z.string().max(CONTENT_LIMITS.questionContextMaxLength).nullable(),
  asked_at: z.iso.datetime(),
});

/**
 * One mock interview and what was said in it (spec §4.3).
 *
 * It carries the transcript in full and **not** the engine's own workings: which planned probe was
 * chosen (`follow_up_index`) and the per-criterion coverage log are positions in a rubric this
 * export does not contain, so they would be meaningless without the answer key and misleading
 * with it. What the candidate is owed about how they did is the rubric-based report (M4), which
 * cites their words back to them; what they are owed here is their words.
 */
const ExportInterview = z.object({
  id: z.uuid(),
  role: z.string().min(1).max(80),
  level: z.string().min(1).max(80),
  stack: z.string().min(1).max(80).nullable(),
  mode: z.string().min(1).max(20),
  is_diagnostic: z.boolean(),
  planned_minutes: z.int().min(1),
  state: z.string().min(1).max(40),
  status: z.string().min(1).max(40),
  started_at: z.iso.datetime(),
  ended_at: z.iso.datetime().nullable(),
  questions: z.array(ExportInterviewQuestion),
  turns: z.array(ExportInterviewTurn),
});

const ExportAiProcessing = z.object({
  purpose: z.string().min(1).max(50),
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  status: z.enum(["ok", "error"]),
  created_at: z.iso.datetime(),
});

/**
 * Response body of `GET /api/me/export` (ADR-0011): everything Readi holds about the signed-in
 * user, as a JSON download. Never contains secrets (password hashes, session or OAuth tokens).
 */
export const DataExport = z.object({
  format_version: z.literal(1),
  generated_at: z.iso.datetime(),
  user: ExportUser,
  profile: ExportProfile.nullable(),
  cv: ExportCv,
  /** Every consent decision ever recorded, oldest first. */
  consents: z.array(ExportConsent),
  linked_accounts: z.array(ExportLinkedAccount),
  sessions: z.array(ExportSession),
  /** Audit entries the user made or that are about their account, oldest first. */
  audit_entries: z.array(ExportAuditEntry),
  /** Every mock interview and its transcript, oldest first. */
  interviews: z.array(ExportInterview),
  /** AI calls made with the user's data (which provider and model), oldest first. No content. */
  ai_processing: z.array(ExportAiProcessing),
});
export type DataExport = z.infer<typeof DataExport>;
