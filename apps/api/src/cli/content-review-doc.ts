// Generates the printable review pages an expert reads instead of the YAML (CLAUDE.md §7.7):
//   pnpm --filter @readi/api content:review-doc [-- --role frontend]
// Reads the seed files only; no database, no network. Commit the output.
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildReviewDoc } from "../content/review-doc";
import { formatProblem, loadSeedDirectory } from "../content/seed-loader";
import { cliArgs } from "./args";

const REPOSITORY_ROOT = resolve(__dirname, "../../../../..");
const GENERATED_BY = "pnpm --filter @readi/api content:review-doc";

function main(): number {
  const { values } = parseArgs({
    args: cliArgs(),
    options: { role: { type: "string" }, dir: { type: "string" }, out: { type: "string" } },
  });
  const directory = resolve(REPOSITORY_ROOT, values.dir ?? "content/seed");
  const outDirectory = resolve(REPOSITORY_ROOT, values.out ?? "content/seed/review");

  const { files, problems } = loadSeedDirectory(directory, REPOSITORY_ROOT);
  if (problems.length > 0) {
    for (const problem of problems) console.error(formatProblem(problem));
    console.error("\nfix the seed files first; nothing was written");
    return 1;
  }

  const roles = values.role
    ? [values.role]
    : readdirSync(directory)
        .filter((entry) => statSync(join(directory, entry)).isDirectory() && entry !== "review")
        .sort();

  mkdirSync(outDirectory, { recursive: true });
  for (const role of roles) {
    const doc = buildReviewDoc(role, files, { generatedBy: GENERATED_BY });
    const path = join(outDirectory, `${role}.md`);
    writeFileSync(path, doc.markdown, "utf8");
    console.log(`wrote ${path.replace(`${REPOSITORY_ROOT}/`, "")}`);
  }
  return 0;
}

process.exit(main());
