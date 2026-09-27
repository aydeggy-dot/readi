import type { CandidatePrompting, SessionReportResponse } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { t } from "@/i18n";
import {
  bandKey,
  catalogueLine,
  promptedSentence,
  questionPromptingSentence,
  reportDate,
  scoreBand,
  scoredSentence,
  sessionPrompting,
  volunteeredSentence,
} from "./report-view";

const prompting = (over: Partial<CandidatePrompting> = {}): CandidatePrompting => ({
  criteria_total: 3,
  criteria_volunteered: 2,
  follow_ups_asked: 1,
  ...over,
});

const report = (over: Partial<SessionReportResponse> = {}): SessionReportResponse => ({
  session_id: "b0d1b2c3-0000-4000-8000-000000000001",
  status: "ready",
  role: { slug: "backend", name: "Backend engineer" },
  level: { slug: "mid", name: "Mid-level" },
  stack: null,
  overall: 71,
  scored_answers: 2,
  total_answers: 2,
  strengths: [],
  fixes: [],
  by_topic: [],
  by_type: [],
  questions: [],
  lessons: [],
  ended_at: "2026-09-27T09:58:00.000Z",
  generated_at: "2026-09-30T10:00:00.000Z",
  ...over,
});

describe("scoreBand", () => {
  it("cuts at 40, 60 and 75 — the lines the charts already draw", () => {
    expect(scoreBand(0)).toBe("weak");
    expect(scoreBand(39)).toBe("weak");
    expect(scoreBand(40)).toBe("developing");
    expect(scoreBand(59)).toBe("developing");
    expect(scoreBand(60)).toBe("solid");
    expect(scoreBand(74)).toBe("solid");
    expect(scoreBand(75)).toBe("strong");
    expect(scoreBand(100)).toBe("strong");
  });

  it("names a band that has copy", () => {
    // A band with no message would throw at render time on the one screen that must not fail.
    for (const overall of [0, 40, 60, 75, 100]) expect(t(bandKey(overall))).toBeTruthy();
  });
});

describe("sessionPrompting", () => {
  it("adds up the points and counts the questions that needed a nudge", () => {
    const totals = sessionPrompting([
      { prompting: prompting({ criteria_total: 3, criteria_volunteered: 2, follow_ups_asked: 1 }) },
      { prompting: prompting({ criteria_total: 4, criteria_volunteered: 4, follow_ups_asked: 0 }) },
    ]);
    expect(totals).toEqual({ total: 7, volunteered: 6, questionsPrompted: 1, questions: 2 });
  });

  it("counts an unscored answer too", () => {
    // The engine's record of what it asked is a fact about the interview whatever the evaluator made
    // of the answer, so a question with no score still contributes its points here.
    const totals = sessionPrompting([
      { prompting: prompting({ criteria_total: 2, criteria_volunteered: 0, follow_ups_asked: 2 }) },
    ]);
    expect(totals).toEqual({ total: 2, volunteered: 0, questionsPrompted: 1, questions: 1 });
  });
});

describe("the sentences", () => {
  it("says all, none and some differently", () => {
    const of = (volunteered: number, total: number) =>
      volunteeredSentence({ total, volunteered, questionsPrompted: 0, questions: 1 }).key;
    expect(of(4, 4)).toBe("interview.report.volunteeredAll");
    expect(of(0, 4)).toBe("interview.report.volunteeredNone");
    expect(of(2, 4)).toBe("interview.report.volunteered");
    // No points at all is not "you volunteered everything".
    expect(of(0, 0)).toBe("interview.report.volunteeredNone");
  });

  it("counts prompted questions with one wording each for none and one", () => {
    const of = (questionsPrompted: number) =>
      promptedSentence({ total: 9, volunteered: 3, questionsPrompted, questions: 4 }).key;
    expect(of(0)).toBe("interview.report.promptedNone");
    expect(of(1)).toBe("interview.report.promptedOne");
    expect(of(3)).toBe("interview.report.prompted");
  });

  it("puts the follow-up count in a question's own line, singular and plural", () => {
    expect(questionPromptingSentence(prompting({ follow_ups_asked: 0 })).key).toBe(
      "interview.report.questionPromptingNone",
    );
    expect(questionPromptingSentence(prompting({ follow_ups_asked: 1 })).key).toBe(
      "interview.report.questionPrompting",
    );
    expect(questionPromptingSentence(prompting({ follow_ups_asked: 2 })).key).toBe(
      "interview.report.questionPromptingMany",
    );
  });

  it("renders with every variable filled in", () => {
    // `t` leaves an unknown placeholder intact, so a missing var would ship as literal "{total}".
    const sentences = [
      volunteeredSentence({ total: 9, volunteered: 3, questionsPrompted: 2, questions: 4 }),
      promptedSentence({ total: 9, volunteered: 3, questionsPrompted: 2, questions: 4 }),
      questionPromptingSentence(prompting()),
      questionPromptingSentence(prompting({ follow_ups_asked: 0 })),
    ];
    for (const sentence of sentences) expect(t(sentence.key, sentence.vars)).not.toMatch(/[{}]/);
  });
});

describe("scoredSentence", () => {
  it("has its own wording for a session with one answer", () => {
    // "All 1 answers scored" is the same bug as the completion screen's "in 1 minutes", and a
    // one-answer session is ordinary: ending after the first question still earns a report.
    const key = (scored_answers: number, total_answers: number) =>
      scoredSentence({ scored_answers, total_answers }).key;
    expect(key(1, 1)).toBe("interview.report.scoredAllOne");
    expect(key(0, 1)).toBe("interview.report.scoredNoneOne");
    expect(key(4, 4)).toBe("interview.report.scoredAll");
    expect(key(0, 4)).toBe("interview.report.scoredNone");
    expect(key(3, 4)).toBe("interview.report.scoredSome");
  });

  it("never leaves a number unfilled, and never says a plural of one", () => {
    const cases: [number, number][] = [
      [1, 1],
      [0, 1],
      [4, 4],
      [0, 4],
      [3, 4],
    ];
    for (const [scored, total] of cases) {
      const sentence = scoredSentence({ scored_answers: scored, total_answers: total });
      const rendered = t(sentence.key, sentence.vars);
      expect(rendered).not.toMatch(/[{}]/);
      expect(rendered, rendered).not.toMatch(/\b1 answers\b/);
    }
  });
});

describe("the report's own header", () => {
  it("joins the pinned catalogue names, and leaves out a variant nobody chose", () => {
    expect(catalogueLine(report())).toBe("Backend engineer · Mid-level");
    expect(catalogueLine(report({ stack: { slug: "react", name: "React" } }))).toBe(
      "Backend engineer · Mid-level · React",
    );
  });

  it("dates the report by the interview, not by when it was assembled", () => {
    expect(reportDate(report())).toBe("2026-09-27");
    // A report with no end time recorded falls back rather than showing nothing.
    expect(reportDate(report({ ended_at: null }))).toBe("2026-09-30");
  });
});
