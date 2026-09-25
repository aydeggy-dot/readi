import { describe, expect, it } from "vitest";
import { contextBlocks } from "./question-context";

describe("contextBlocks", () => {
  it("keeps prose as prose, line breaks and all", () => {
    expect(contextBlocks("A users table.\n\nIt has 40 million rows.")).toEqual([
      { kind: "text", text: "A users table.\n\nIt has 40 million rows." },
    ]);
  });

  it("tells a fenced block from the prose around it", () => {
    const context = [
      "You are reviewing this:",
      "",
      "```ts",
      "useEffect(() => setCount(count + 1));",
      "```",
      "",
      "What would you say?",
    ].join("\n");

    expect(contextBlocks(context)).toEqual([
      { kind: "text", text: "You are reviewing this:" },
      { kind: "code", text: "useEffect(() => setCount(count + 1));" },
      { kind: "text", text: "What would you say?" },
    ]);
  });

  it("keeps the indentation inside a snippet", () => {
    const context = "```\nif (x) {\n  return 1;\n}\n```";
    expect(contextBlocks(context)).toEqual([{ kind: "code", text: "if (x) {\n  return 1;\n}" }]);
  });

  it("shows the code of an unterminated fence rather than dropping it", () => {
    expect(contextBlocks("Here:\n```\nSELECT 1;")).toEqual([
      { kind: "text", text: "Here:" },
      { kind: "code", text: "SELECT 1;" },
    ]);
  });

  it("has no blocks for setup material that is only whitespace", () => {
    expect(contextBlocks("   \n\n  ")).toEqual([]);
    expect(contextBlocks("```\n\n```")).toEqual([]);
  });

  it("handles more than one snippet", () => {
    const context = "Before\n```\none\n```\nBetween\n```\ntwo\n```\nAfter";
    expect(contextBlocks(context).map((block) => block.kind)).toEqual([
      "text",
      "code",
      "text",
      "code",
      "text",
    ]);
  });
});
