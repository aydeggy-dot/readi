import { describe, expect, it } from "vitest";
import { cliArgs } from "./args";

describe("cliArgs", () => {
  it("drops the separator pnpm forwards", () => {
    expect(cliArgs(["node", "cli.js", "--", "--email", "a@b.co"])).toEqual(["--email", "a@b.co"]);
  });

  it("leaves a direct invocation alone", () => {
    expect(cliArgs(["node", "cli.js", "--email", "a@b.co"])).toEqual(["--email", "a@b.co"]);
    expect(cliArgs(["node", "cli.js"])).toEqual([]);
  });
});
