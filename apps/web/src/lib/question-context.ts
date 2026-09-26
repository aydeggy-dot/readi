/**
 * A question's setup material, split into the blocks a screen can draw.
 *
 * **There is no markdown renderer on the interview route** and there must not be one: `marked` and
 * `dompurify` are the CMS preview's dependencies and the chat screen has a Slow 4G budget to keep
 * (ADR-0013, the M3 plan). A question's `context` can hold a fenced code block, a short table or a
 * scenario, so this does the one thing that actually matters — tell code from prose — and the screen
 * renders prose as prose and a fence as a `<pre>`.
 *
 * `context` never passes through a model: it comes from the pinned question and is rendered
 * verbatim, which is also why nothing here rewrites the text inside a block.
 */
export type ContextBlock = { kind: "text" | "code"; text: string };

const FENCE = "```";

export function contextBlocks(context: string): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  let kind: ContextBlock["kind"] = "text";
  let lines: string[] = [];

  const flush = () => {
    // Blank lines around a fence belong to neither block; an all-blank block is not a block.
    const text = lines
      .join("\n")
      .replace(/^\s*\n|\n\s*$/g, "")
      .trimEnd();
    if (text.trim().length > 0) blocks.push({ kind, text });
    lines = [];
  };

  for (const line of context.split("\n")) {
    // The info string after the fence (```ts) names a language we do not highlight, so it is dropped.
    if (line.trimStart().startsWith(FENCE)) {
      flush();
      kind = kind === "text" ? "code" : "text";
      continue;
    }
    lines.push(line);
  }
  // An unterminated fence still yields its code: a half-written question should show what it has.
  flush();
  return blocks;
}
