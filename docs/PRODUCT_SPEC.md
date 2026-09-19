# Readi — Product Specification

Phase tags: **[MVP]** launch scope · **[P2]** months 4–8 · **[P3]** months 8–12+.
Only build items tagged for the milestone you are working on.

---

## 1. Problem & vision

Many capable developers, QA engineers, and DevOps engineers fail interviews because they haven't practiced
realistic interviews and get no honest feedback until they fail real ones. Existing tools are priced in USD,
built for US/UK users, weak on accents, and each covers only one piece (content, delivery coaching, coding,
or human mocks).

**Vision:** the most effective way for African tech talent — and anyone globally — to become interview-ready,
combining a structured program, a realistic AI interviewer that asks follow-ups, fair rubric-based feedback,
and delivery coaching, at local prices.

**North-star metric:** % of active candidates who report an interview offer within 90 days of reaching "Ready".

## 2. Users

| Persona | Description | Key needs |
|---|---|---|
| Early-career candidate | Bootcamp grad / junior dev in Nigeria, mostly on Android, limited data | Affordable, structured path, confidence, low-data mode |
| Mid-level switcher | 2–5 yrs experience, targeting remote roles at foreign companies | Realistic foreign-style interviews, system design, salary negotiation |
| Cohort learner | Enrolled via a bootcamp, tech hub, university, or government programme | Seat from an organization, progress visible to the program |
| Org admin | Bootcamp/tech hub staff | Invite learners, track cohort readiness |
| Content expert | Senior engineer contracted to write/review questions and rubrics | Efficient authoring and review workflow |
| Platform admin | Readi staff | Manage users, plans, content, flags, refunds |

## 3. Launch scope

- **Roles at MVP:** Frontend Engineer, Backend Engineer, QA Engineer. Levels: Intern/Junior, Mid.
- **Interview types at MVP:** Behavioral (STAR), Technical concepts (role-specific), QA scenario/test-design.
- **Platforms at MVP:** responsive web app installable as a PWA. Native mobile is P2.
- **Markets:** Nigeria (NGN via Paystack) + international (USD via Stripe).

## 4. Features by module

### 4.1 Accounts & onboarding
- [MVP] Sign up / log in: email + password, Google, phone OTP (Nigerian numbers, E.164).
- [MVP] Career profile: target role, level, years of experience, primary stack, target company type (`local_startup`, `enterprise_bank_telco`, `remote_foreign`, `big_tech`), target interview date (optional).
- [MVP] CV upload (PDF/DOCX ≤ 5 MB) → text extraction → LLM structured parse (`skills[]`, `projects[]`, `experience[]`, `gaps[]`) stored on profile; candidate can edit.
- [MVP] Consent screen (audio processing required for voice mode; recording storage optional; camera coaching optional; marketing optional).
- [MVP] Diagnostic interview (~15 min, text or voice) that seeds the first readiness score and study plan.
- [P2] Job description import: paste JD text → extract required skills → generate targeted mock.

### 4.2 Learning program
- [MVP] Role tracks: `Track → Module → Lesson | PracticeItem`. Tracks keyed by role + level.
- [MVP] Question bank (see data model). Every question links to exactly one rubric.
- [MVP] Text lessons (markdown), each ending with a practice question.
- [MVP] Personalized study plan: rules-based scheduler weighting weak topics, spread across days until target date (default 4 weeks); LLM only writes the friendly weekly summary.
- [P2] Spaced repetition (SM-2) for poorly answered questions.
- [P2] Video lessons.

### 4.3 AI mock interviewer
- [MVP] Text mode interview (chat UI).
- [MVP] Voice mode interview (LiveKit; STT → LLM → TTS streaming) with automatic fallback to text.
- [MVP] Session setup: role, level, type, length (15 / 30 / 45 min), persona (`friendly` at MVP).
- [MVP] Deterministic state machine (see CLAUDE.md §5). Question selection: from bank, filtered by role/level/type, weighted toward weak topics, excluding questions seen in the last N sessions.
- [MVP] Follow-ups: up to 2 per question (configurable), generated to probe rubric criteria not yet covered.
- [MVP] Candidate-questions segment at the end ("Do you have any questions for me?") with lightweight feedback.
- [P2] Personas: `neutral`, `tough`; formats: `nigerian_fintech_screen`, `us_remote_round`.
- [P2] Coding interview (Monaco + Judge0) and system design (Excalidraw + vision review).
- [P3] AI avatar interviewer (streaming avatar provider) with bandwidth fallback.
- [P3] DevOps hands-on incident labs (ephemeral containers).

### 4.4 Evaluation & feedback
- [MVP] Per-answer evaluation (schema in §6.2) against rubric; evidence quotes required.
- [MVP] Session report: overall score, per-dimension scores, top 3 strengths, top 3 fixes, per-question breakdown with "what a strong answer covers", links to relevant lessons.
- [MVP] Speech delivery metrics from timestamped transcript (voice mode): words per minute, filler-word rate, long pauses (> 3 s), average answer duration, rambling flag (answer > 2.5 min for a non-design question).
- [MVP] Readiness score per role (see §7).
- [MVP] Internal calibration tool: admins/experts blind-score sampled answers; dashboard of AI-vs-human agreement.
- [P2] Camera coaching (opt-in, on-device MediaPipe): gaze-toward-camera %, face-in-frame %, lighting check, posture drift, excessive movement. Presented as coaching tips, never as personality/confidence/emotion scores.
- [P2] Session replay with timeline markers (only if recording consent given).
- [P3] Paid human expert review marketplace.

### 4.5 Progress & engagement
- [MVP] Dashboard: readiness score trend, scores by topic, sessions completed, next plan items.
- [MVP] Email reminders (Resend).
- [P2] Streaks, push notifications (FCM), WhatsApp reminders.
- [P2] Shareable "Interview-Ready" certificate after passing a final assessed mock.

### 4.6 Billing
- [MVP] Plans (initial, prices configurable in admin — do not hardcode):
  - `free`: lessons preview, limited question bank, 3 text mocks/month.
  - `standard`: full program, text + voice mocks with monthly voice-minute allowance, full reports.
  - `premium`: higher allowance, priority features (camera coaching P2, avatar P3).
  - Billing periods: weekly and monthly (NGN), monthly and annual (USD).
- [MVP] Paystack (NGN) and Stripe (USD) checkout; country-based routing with manual override.
- [MVP] Voice-minute top-ups (one-off purchase).
- [MVP] Renewal reminder email 3 days before renewal; one-click cancel (effective end of period); clear refund policy page.
- [P2] Organization seat purchases + invite codes.

### 4.7 Feedback & quality loop
- [MVP] Post-session rating (1–5) + optional comment.
- [MVP] Flag a question ("incorrect", "unclear", "unfair score") → admin review queue.
- [MVP] Product analytics events (PostHog), see §9.
- [P2] Outcome survey at 30/60/90 days: interviews landed, offers received.

### 4.8 Admin & content
- [MVP] RBAC roles: `candidate`, `content_expert`, `org_admin` (P2), `admin`.
- [MVP] Content CMS: CRUD tracks/modules/lessons/questions/rubrics; statuses `draft → in_review → published → retired`; version history; only `published` content served to candidates.
- [MVP] Seed import from `/content/seed/*.yaml`.
- [MVP] Admin: users, subscriptions, manual entitlement grants (audited), flag queue, plan/price config.
- [P2] Org portal: cohorts, invites, cohort readiness dashboard.
- [P3] Opt-in employer talent pool.

## 5. Core user flows (MVP)

1. **Onboard:** Landing → sign up → profile → CV upload (optional) → consent → diagnostic interview → report → study plan created → dashboard.
2. **Practice:** Dashboard → "Start mock interview" → setup → allowance check → interview (voice or text) → processing screen (evaluation job) → report → rate session.
3. **Learn:** Dashboard → today's plan item → lesson → practice question → quick feedback.
4. **Subscribe:** Paywall/pricing → checkout (Paystack or Stripe) → webhook → entitlement → confirmation.
5. **Cancel:** Settings → Billing → Cancel → confirmation; access until period end.

## 6. Data model (initial; refine in Prisma)

### 6.1 Entities
- `User` (id, email?, phone?, name, country, locale, role, created_at, deleted_at)
- `Profile` (user_id, target_role, level, years_experience, stack[], target_company_type, target_date, cv_file_key?, cv_parsed JSON)
- `ConsentRecord` (user_id, type, granted, version, granted_at, revoked_at)
- `Track` (id, role, level, title, status, version) → `Module` → `Lesson` (markdown body)
- `Question` (id, role[], level[], type, topic, subtopic, difficulty 1–5, prompt, context?, rubric_id, ideal_points[], status, version, embedding vector)
- `Rubric` (id, name, version) → `RubricCriterion` (id, rubric_id, dimension, description, weight, levels: {0..4 descriptors})
- `StudyPlan` (user_id, role, start_date, target_date) → `PlanItem` (type lesson|practice|mock, ref_id, due_date, status)
- `InterviewSession` (id, user_id, role, level, type, mode text|voice, persona, planned_minutes, state, started_at, ended_at, prompt_versions JSON, model_config JSON)
- `SessionTurn` (session_id, seq, speaker interviewer|candidate, state, question_id?, text, started_ms, ended_ms, stt_confidence?)
- `AnswerEvaluation` (session_id, question_id, criteria JSON, overall 0–100, strengths[], gaps[], tip, evaluator_model, prompt_version, status ok|retry|failed)
- `DeliveryMetrics` (session_id, wpm, filler_rate, long_pauses, avg_answer_sec, rambling_count, camera_metrics JSON?)
- `SessionReport` (session_id, summary JSON, overall_score)
- `ReadinessSnapshot` (user_id, role, score, components JSON, formula_version, created_at)
- `Plan` (code, name, features JSON) → `Price` (plan_id, currency, amount_minor, interval, provider_ref)
- `Subscription` (user_id | org_id, plan_id, provider, provider_sub_id, status, current_period_end, cancel_at_period_end)
- `Entitlement` (user_id, key, value, source, expires_at)
- `UsageLedger` (user_id, session_id?, kind voice_minutes|avatar_minutes|llm_tokens, quantity, cost_minor_usd, created_at)
- `Payment` (provider, provider_ref, amount_minor, currency, status, raw JSON)
- `WebhookEvent` (provider, event_id UNIQUE, type, processed_at, payload JSON)
- `SessionFeedback` (session_id, rating, comment)
- `ContentFlag` (question_id, user_id, reason, note, status)
- `CalibrationScore` (answer_evaluation_id, expert_id, criteria JSON)
- `Organization`, `OrgMember`, `Invite` [P2]
- `AuditLog` (actor_id, action, target, before, after, created_at)

### 6.2 Answer evaluation schema (shared: Pydantic ↔ Zod)
```json
{
  "question_id": "string",
  "criteria": [
    {
      "criterion_id": "string",
      "score": 0,
      "max_score": 4,
      "evidence": ["exact short quote from candidate transcript"],
      "reasoning": "one or two sentences"
    }
  ],
  "covered_points": ["..."],
  "missing_points": ["..."],
  "strengths": ["..."],
  "improvement_tip": "one concrete, actionable tip",
  "red_flags": ["optional: factual errors stated by candidate"],
  "confidence": "low|medium|high"
}
```
Rules: score 0 allowed with empty evidence only if the criterion was not addressed at all; otherwise evidence is mandatory. Overall = weighted average of criteria scaled to 0–100 (computed in code).

## 7. Readiness score (formula v1 — implement in code, unit-test, version it)

Per role, 0–100:
- `technical` (40%): mean overall of technical/scenario answers, last 5 sessions, recency-weighted (most recent ×1.0, then ×0.85, ×0.7, ×0.55, ×0.4).
- `behavioral` (25%): same for behavioral answers.
- `communication` (20%): derived from delivery metrics (WPM in 110–170 → full marks, linear decay outside; filler rate < 3/min → full; long pauses and rambling penalties). Text-only users: based on structure/clarity criteria.
- `coverage` (15%): % of the track's core topics practiced at least once with overall ≥ 60.

Bands: `< 40 Getting started`, `40–59 Developing`, `60–74 Nearly ready`, `≥ 75 Ready`.
A user cannot be labelled `Ready` with fewer than 3 completed mock sessions.

## 8. Non-functional requirements

- **Latency:** voice turn response target < ~1 s (p50), < 2 s (p95). Report generation < 60 s after session end.
- **Availability:** 99.5% at launch.
- **Bandwidth:** text mode usable on 2G/3G; voice mode with Opus at low bitrate; pages usable on "Slow 4G".
- **Accessibility:** WCAG 2.1 AA basics; captions/transcript always visible during voice interviews.
- **Security:** OWASP Top 10 mitigations; rate limiting on auth, AI, and payment endpoints; signed webhook verification; secrets in environment/secret manager.
- **Privacy:** NDPA 2023 + GDPR-ready: consent records, data export, deletion, retention jobs, DPA-ready subprocessors list in `docs/privacy/subprocessors.md`.
- **Cost:** track cost per session; alert if average voice session cost exceeds a configured threshold.
- **Fairness:** STT benchmark on Nigerian-accented speech before choosing a provider; monitor score distributions for anomalies.

## 9. Analytics events (PostHog)

`signup_completed`, `profile_completed`, `consent_updated`, `diagnostic_completed`, `session_started`
(mode, type, role), `session_completed`, `session_abandoned` (state, minutes), `voice_fallback_to_text`,
`report_viewed`, `lesson_completed`, `plan_item_completed`, `paywall_viewed`, `checkout_started`,
`subscription_activated`, `subscription_cancelled`, `session_rated`, `question_flagged`, `readiness_band_changed`.
Never include PII or transcript text in event properties.

## 10. Out of scope (do not build)

- Any live assistance during real interviews (copilots, hidden overlays, answer whispering).
- Emotion, personality, or "confidence" inference from face or voice.
- Scraping or reproducing proprietary/leaked interview questions.
- Native mobile apps before milestone P2-1.
