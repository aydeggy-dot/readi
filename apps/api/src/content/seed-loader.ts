import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SeedFile } from "@readi/shared-types";
import { LineCounter, parseDocument, type Node } from "yaml";

/**
 * Reading `/content/seed`: YAML in, validated seed files out, and every complaint carrying the
 * file, line and column that caused it.
 *
 * That last part is the reason this module exists. Seed content is written by hand and reviewed by
 * people who are content experts, not YAML experts: "content/seed/frontend/questions.yaml:84:7 —
 * questions[2].ideal_points: expected array" sends them to the right line, and
 * "invalid seed file" does not.
 */

export interface SeedProblem {
  /** Repository-relative, so the message can be pasted into an editor. */
  file: string;
  line: number;
  column: number;
  /** Where in the document, in the file's own words (`questions[2].rubric`). */
  path: string;
  message: string;
}

export interface LoadedSeedFile {
  file: string;
  data: SeedFile;
}

export interface SeedLoadResult {
  files: LoadedSeedFile[];
  problems: SeedProblem[];
}

/** Every `.yaml` file under `root`, deepest paths last, in a stable order. */
export function findSeedFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".yaml") || entry.endsWith(".yml")) found.push(path);
    }
  };
  walk(root);
  return found;
}

/** Parses and validates one file's source. Returns either the data or everything wrong with it. */
export function loadSeedSource(
  file: string,
  source: string,
): { data: SeedFile | null; problems: SeedProblem[] } {
  const lineCounter = new LineCounter();
  const document = parseDocument(source, { lineCounter, keepSourceTokens: true });

  const at = (offset: number | undefined) => {
    const position = lineCounter.linePos(offset ?? 0);
    return { line: position.line, column: position.col };
  };

  if (document.errors.length > 0) {
    return {
      data: null,
      problems: document.errors.map((error) => ({
        file,
        ...at(error.pos[0]),
        path: "",
        message: error.message.split("\n")[0] ?? error.message,
      })),
    };
  }

  const parsed = SeedFile.safeParse(document.toJS());
  if (parsed.success) return { data: parsed.data, problems: [] };

  return {
    data: null,
    problems: parsed.error.issues.map((issue) => {
      const node = nodeAt(document, issue.path);
      return {
        file,
        ...at(node?.range?.[0]),
        path: formatPath(issue.path),
        message: issue.message,
      };
    }),
  };
}

/** Reads every seed file under `root`. A file with problems contributes problems, not data. */
export function loadSeedDirectory(root: string, repositoryRoot = root): SeedLoadResult {
  const files: LoadedSeedFile[] = [];
  const problems: SeedProblem[] = [];
  for (const path of findSeedFiles(root)) {
    const name = relative(repositoryRoot, path) || path;
    const result = loadSeedSource(name, readFileSync(path, "utf8"));
    problems.push(...result.problems);
    if (result.data) files.push({ file: name, data: result.data });
  }
  return { files, problems };
}

/**
 * The YAML node an issue is about, or the nearest ancestor that exists. A missing required key has
 * no node of its own, so the answer for `questions[2].prompt` is the node for `questions[2]` —
 * which is the line a reader needs anyway.
 */
function nodeAt(
  document: ReturnType<typeof parseDocument>,
  path: readonly PropertyKey[],
): Node | null {
  for (let length = path.length; length >= 0; length -= 1) {
    const candidate: unknown =
      length === 0 ? document.contents : document.getIn(path.slice(0, length) as string[], true);
    if (candidate && typeof candidate === "object" && "range" in candidate) {
      return candidate as Node;
    }
  }
  return null;
}

/** `questions[2].ideal_points[0]`, the way the file reads rather than the way Zod prints it. */
export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((part) => (typeof part === "number" ? `[${part}]` : `.${String(part)}`))
    .join("")
    .replace(/^\./, "");
}

/** One problem, as a line a person can act on. */
export const formatProblem = (problem: SeedProblem): string =>
  `${problem.file}:${problem.line}:${problem.column}` +
  `${problem.path ? ` — ${problem.path}` : ""}: ${problem.message}`;
