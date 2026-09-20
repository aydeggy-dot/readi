/**
 * Arguments for a CLI run through pnpm. pnpm 12 forwards the `--` separator itself
 * (`pnpm … admin:grant -- --email x` reaches us as `-- --email x`), and Node's parseArgs treats
 * everything after a `--` as positional, so drop a leading one.
 */
export function cliArgs(argv = process.argv): string[] {
  const args = argv.slice(2);
  return args[0] === "--" ? args.slice(1) : args;
}
