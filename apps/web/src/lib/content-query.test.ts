import { describe, expect, it } from "vitest";
import { contentListQuery, isFiltered, nextPageHref } from "./content-query";

const TOPIC = "2f1c8a5e-7b3d-4c9a-8e61-0d5f4b2a9c73";

describe("contentListQuery", () => {
  it("keeps the values the API understands", () => {
    expect(
      contentListQuery({
        status: "in_review",
        role: "frontend",
        level: "mid",
        stack: "react-typescript",
        type: "technical",
        topic_id: TOPIC,
        q: "  caching  ",
        cursor: "abc",
      }),
    ).toEqual({
      status: "in_review",
      role: "frontend",
      level: "mid",
      stack: "react-typescript",
      type: "technical",
      topic_id: TOPIC,
      q: "caching",
      cursor: "abc",
    });
  });

  it("passes a slug it has never heard of on to the API", () => {
    // Roles and levels are content now (ADR-0015): which ones exist is not a fact this build has.
    const query = contentListQuery({ role: "devops", level: "staff-plus" });
    expect(query.role).toBe("devops");
    expect(query.level).toBe("staff-plus");
  });

  it("drops anything it does not recognise, rather than passing it on", () => {
    const query = contentListQuery({
      status: "deleted",
      role: "Not A Slug",
      level: "a".repeat(200),
      stack: "React + TypeScript",
      type: "riddle",
      topic_id: "not-a-uuid",
      q: "",
      cursor: "",
    });
    expect(query).toEqual({
      status: undefined,
      role: undefined,
      level: undefined,
      stack: undefined,
      type: undefined,
      topic_id: undefined,
      q: undefined,
      cursor: undefined,
    });
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(contentListQuery({ status: ["draft", "published"] }).status).toBe("draft");
  });

  it("knows a cursor is not a filter", () => {
    expect(isFiltered(contentListQuery({ cursor: "abc" }))).toBe(false);
    expect(isFiltered(contentListQuery({ status: "draft" }))).toBe(true);
  });
});

describe("nextPageHref", () => {
  it("carries the filters forward and replaces the cursor", () => {
    const href = nextPageHref(
      "/admin/content/questions",
      contentListQuery({ status: "draft", q: "caching", cursor: "page-1" }),
      "page-2",
    );
    expect(href).toBe("/admin/content/questions?status=draft&q=caching&cursor=page-2");
  });
});
