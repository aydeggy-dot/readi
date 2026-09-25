// Generates the printable review pages an expert reads instead of the YAML (CLAUDE.md §7.7):
//   pnpm --filter @readi/api content:review-doc [-- --role frontend]
// Reads the seed files only; no database, no network. Commit the output.
import { mkdirSync, writeFileSync } from "node:fs";
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

  /*
   * Which roles exist is `roles.yaml`, not the directory listing (ADR-0015): a role is content,
   * and `content/seed` holds directories that are not roles. A role with nothing to review would
   * produce an empty page, so a role is listed when some question is offered to it or some track
   * is written for it.
   *
   * That used to be "has a directory of its own", which is the same defect `review-doc.ts` was
   * fixed for on 2026-09-25: `fullstack` has no directory and is offered 62 questions out of the
   * other three banks, so the role with the most unreviewed content reaching candidates was the
   * one role getting no page at all.
   */
  const catalogue = files.flatMap(({ data }) => data.career_roles ?? []).map((role) => role.slug);
  const hasContent = (slug: string) =>
    files.some(
      ({ data }) =>
        data.track?.role === slug ||
        (data.questions ?? []).some((question) => question.roles.includes(slug)),
    );
  const roles = values.role ? [values.role] : catalogue.filter(hasContent);

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
