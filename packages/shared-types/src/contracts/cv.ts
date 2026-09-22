import { z } from "zod";
import {
  CONTENT_LIMITS,
  CV_CONTENT_TYPES,
  CV_MAX_BYTES,
  CV_STATUSES,
  PARSED_CV_LIMITS as L,
} from "../constants.js";

const text = (max: number) => z.string().trim().min(1).max(max);

export const CvContentType = z.enum(CV_CONTENT_TYPES).meta({ id: "CvContentType" });
export type CvContentType = z.infer<typeof CvContentType>;

export const CvStatus = z.enum(CV_STATUSES).meta({ id: "CvStatus" });
export type CvStatus = z.infer<typeof CvStatus>;

/** Why a CV could not be parsed. Never carries CV content. */
export const CvParseError = z
  .enum([
    "no_text", // e.g. a scanned PDF: no extractable text
    "encrypted",
    "invalid_file", // corrupt, or not really a PDF/DOCX
    "too_large", // beyond page, character or archive-size limits
    "llm_error", // provider unavailable or refused
    "invalid_output", // model output failed validation after retries
    "worker_unavailable",
  ])
  .meta({ id: "CvParseError" });
export type CvParseError = z.infer<typeof CvParseError>;

/** Year and month, e.g. "2024-03". */
export const YearMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .meta({ id: "YearMonth" });

export const CvProject = z
  .object({
    name: text(L.titleLength),
    description: z.string().trim().max(L.textLength),
    technologies: z.array(text(L.skillLength)).max(L.technologies),
  })
  .meta({ id: "CvProject" });
export type CvProject = z.infer<typeof CvProject>;

export const CvExperience = z
  .object({
    title: text(L.titleLength),
    organisation: z.string().trim().max(L.titleLength),
    start: YearMonth.nullable(),
    end: YearMonth.nullable(),
    current: z.boolean(),
    summary: z.string().trim().max(L.textLength),
  })
  .meta({ id: "CvExperience" });
export type CvExperience = z.infer<typeof CvExperience>;

/**
 * Structured CV (spec §4.1). Deliberately has no fields for contact details (name, email, phone,
 * address): the parser must not extract them. `gaps` are skills or experience commonly expected for
 * the candidate's target role that the CV does not show — input for tailoring practice.
 */
export const ParsedCv = z
  .object({
    skills: z.array(text(L.skillLength)).max(L.skills),
    projects: z.array(CvProject).max(L.projects),
    experience: z.array(CvExperience).max(L.experience),
    gaps: z.array(text(L.gapLength)).max(L.gaps),
  })
  .meta({ id: "ParsedCv" });
export type ParsedCv = z.infer<typeof ParsedCv>;

// ---- Web ↔ API

/** Body of `POST /api/me/cv/uploads`: what the browser is about to upload. */
export const CreateCvUploadRequest = z.object({
  content_type: CvContentType,
  size_bytes: z.int().min(1).max(CV_MAX_BYTES),
});
export type CreateCvUploadRequest = z.infer<typeof CreateCvUploadRequest>;

/** A presigned upload: PUT the file to `url` with exactly these headers before `expires_at`. */
export const CvUploadResponse = z.object({
  upload_id: z.uuid(),
  url: z.url(),
  headers: z.record(z.string(), z.string()),
  expires_at: z.iso.datetime(),
});
export type CvUploadResponse = z.infer<typeof CvUploadResponse>;

/** Body of `POST /api/me/cv`: confirms an upload so it is checked and parsed. */
export const ConfirmCvUploadRequest = z.object({ upload_id: z.uuid() });
export type ConfirmCvUploadRequest = z.infer<typeof ConfirmCvUploadRequest>;

/** Response body of `GET /api/me/cv` (and the CV mutations). */
export const CvResponse = z.object({
  status: CvStatus,
  content_type: CvContentType.nullable(),
  uploaded_at: z.iso.datetime().nullable(),
  parsed_at: z.iso.datetime().nullable(),
  edited_at: z.iso.datetime().nullable(),
  error: CvParseError.nullable(),
  parsed: ParsedCv.nullable(),
});
export type CvResponse = z.infer<typeof CvResponse>;

// ---- API ↔ worker (cross-language, ADR-0003 / ADR-0010)

export const AiCallPurpose = z
  .enum([
    "interviewer",
    "follow_up",
    "evaluator",
    "cv_parse",
    "plan_summary",
    "embedding",
    "stt",
    "tts",
    "avatar",
  ])
  .meta({ id: "AiCallPurpose" });
export type AiCallPurpose = z.infer<typeof AiCallPurpose>;

export const AiUnitKind = z.enum(["tokens", "characters", "seconds"]).meta({ id: "AiUnitKind" });

/** One external AI call, for `ai_call_log` (ADR-0007). Cost in integer micro-USD. No content, no PII. */
export const AiCallRecord = z
  .object({
    purpose: AiCallPurpose,
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(80),
    status: z.enum(["ok", "error"]),
    error_code: z.string().min(1).max(60).nullable(),
    latency_ms: z.int().min(0),
    input_units: z.int().min(0),
    output_units: z.int().min(0),
    unit_kind: AiUnitKind,
    cost_micro_usd: z.int().min(0),
  })
  .meta({ id: "AiCallRecord" });
export type AiCallRecord = z.infer<typeof AiCallRecord>;

/** Base64 length of the largest allowed CV. */
const MAX_CV_BASE64_LENGTH = Math.ceil(CV_MAX_BYTES / 3) * 4;

/**
 * Body of worker `POST /cv/parse`. Carries the file itself (ADR-0004) and minimal context only.
 *
 * The role and level travel as **labels, not keys** (ADR-0015). The worker only ever turned a key
 * into prompt prose — `frontend` into "a frontend engineer" — through a hardcoded map that had to
 * list every enum value. With roles as content there is no enum to exhaust and no key the worker
 * could recognise, so the API, which holds the catalogue, sends the words: "Backend engineer",
 * "Mid-level". The map and the test that guarded its completeness are deleted.
 */
export const CvParseRequest = z.object({
  request_id: z.uuid(),
  content_type: CvContentType,
  file_base64: z.base64().min(1).max(MAX_CV_BASE64_LENGTH),
  target_role_label: text(CONTENT_LIMITS.titleMaxLength),
  level_label: text(CONTENT_LIMITS.titleMaxLength),
});
export type CvParseRequest = z.infer<typeof CvParseRequest>;

/** Response of worker `POST /cv/parse`. */
export const CvParseResponse = z.object({
  request_id: z.uuid(),
  status: z.enum(["parsed", "unreadable", "failed"]),
  parsed: ParsedCv.nullable(),
  error: CvParseError.nullable(),
  ai_calls: z.array(AiCallRecord),
});
export type CvParseResponse = z.infer<typeof CvParseResponse>;
