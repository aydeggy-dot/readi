#!/usr/bin/env node
// Does an event stream survive the Next.js rewrite, under `next start`?
//
// The interview screen reads whole-turn frames from `POST /api/interviews/:id/advance` over SSE
// (ADR-0016). The browser talks to the API same-origin through `/api/*`, which means every frame
// passes through **two** pieces of Next: `proxy.ts` (which matches `/api/:path*` and rewrites the
// request headers) and the rewrite to `API_INTERNAL_URL`. Either could buffer the response until it
// ends, and `next dev` and `next start` are different code paths — so this is proved against a
// production build before a screen is written against it.
//
// It is isolated on purpose: a stub origin that emits frames on a known schedule, so a failure is
// Next's buffering and nothing else. What our own route puts on the wire is
// `interviews-sse.int.spec.ts`; that this arrives incrementally is here.
//
//   node scripts/sse-rewrite-proof.mjs
//
// Needs the e2e web build (it makes one if absent). Nothing else: no database, no API, no worker.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps/web");
const DIST = ".next-e2e";

// The same ports the e2e harness uses, and they are not a free choice: Next resolves rewrite
// destinations at BUILD time (tasks/lessons.md), so the origin must listen on whatever
// API_INTERNAL_URL was baked into this build.
const API_PORT = Number(process.env.E2E_API_PORT ?? 4010);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);

const FRAMES = 5;
const GAP_MS = 300;
/** A buffering proxy delivers everything at once, so every frame would land inside this. */
const SPREAD_FLOOR_MS = (FRAMES - 1) * GAP_MS * 0.6;

function log(message) {
  process.stdout.write(`${message}\n`);
}

/** An origin that writes one frame every GAP_MS, flushing as it goes. */
function stubOrigin() {
  const server = createServer((request, response) => {
    if (!request.url?.startsWith("/api/stream-probe")) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let sent = 0;
    const timer = setInterval(() => {
      response.write(`data: ${JSON.stringify({ type: "probe", n: sent })}\n\n`);
      if (++sent === FRAMES) {
        clearInterval(timer);
        response.end();
      }
    }, GAP_MS);
    request.on("close", () => clearInterval(timer));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(API_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function build() {
  if (existsSync(join(WEB, DIST, "BUILD_ID"))) {
    log(`==> Reusing the existing build in apps/web/${DIST}`);
    return;
  }
  log(`==> Building the web app into apps/web/${DIST} (API_INTERNAL_URL baked in at build time)`);
  await run(
    "pnpm",
    ["turbo", "run", "build", "--filter=@readi/web^...", "--output-logs=errors-only"],
    ROOT,
    {},
  );
  await run("pnpm", ["exec", "next", "build"], WEB, {
    NEXT_DIST_DIR: DIST,
    API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
    APP_ENV: "development",
  });
}

function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

async function startWeb() {
  log(`==> Starting next start on ${WEB_PORT}`);
  const child = spawn("pnpm", ["exec", "next", "start", "--port", String(WEB_PORT)], {
    cwd: WEB,
    // Its own process group: `pnpm exec` starts `next-server` as a grandchild, and killing only
    // the child leaves that grandchild holding this script's stdout pipe open for ever.
    detached: true,
    env: {
      ...process.env,
      NEXT_DIST_DIR: DIST,
      API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
      APP_ENV: "development",
      // proxy.ts needs it, and it is what the stub would have been sent had it checked.
      WEB_PROXY_SECRET: process.env.WEB_PROXY_SECRET ?? "sse-proof-only-secret-0123456789abcdef",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`    next | ${chunk}`));
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      // A page rather than the stream: a HEAD on the probe route opens a stream through the
      // rewrite, and the connection it leaves behind is one the stub then waits to drain.
      await fetch(`http://127.0.0.1:${WEB_PORT}/`, { method: "HEAD" });
      return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  child.kill("SIGTERM");
  throw new Error("next start did not come up");
}

/** Reads the stream through the web origin, timing every frame's arrival. */
async function probe() {
  const started = performance.now();
  const response = await fetch(`http://127.0.0.1:${WEB_PORT}/api/stream-probe`);
  const headers = {
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
    transferEncoding: response.headers.get("transfer-encoding"),
  };
  const arrivals = [];
  const decoder = new TextDecoder();
  let buffered = "";
  for await (const chunk of response.body) {
    buffered += decoder.decode(chunk, { stream: true });
    let index = buffered.indexOf("\n\n");
    while (index !== -1) {
      const frame = buffered.slice(0, index).trim();
      buffered = buffered.slice(index + 2);
      if (frame.startsWith("data:")) arrivals.push(Math.round(performance.now() - started));
      index = buffered.indexOf("\n\n");
    }
  }
  return { headers, arrivals };
}

function report({ headers, arrivals }) {
  log("");
  log(`    status           ${headers.status}`);
  log(`    content-type     ${headers.contentType}`);
  log(`    content-length   ${headers.contentLength ?? "(absent — not buffered to a length)"}`);
  log(`    transfer-encoding ${headers.transferEncoding ?? "(absent)"}`);
  log(`    frames arrived at ${arrivals.join(" ms, ")} ms`);

  const problems = [];
  if (headers.status !== 200) problems.push(`status ${headers.status}`);
  if (!headers.contentType?.startsWith("text/event-stream")) {
    problems.push(`content-type is "${headers.contentType}", not text/event-stream`);
  }
  if (arrivals.length !== FRAMES) {
    problems.push(`${arrivals.length} frames arrived, expected ${FRAMES}`);
  }
  const spread = arrivals.length > 1 ? arrivals.at(-1) - arrivals[0] : 0;
  if (spread < SPREAD_FLOOR_MS) {
    problems.push(
      `every frame arrived within ${spread} ms of the first, under the ${SPREAD_FLOOR_MS} ms floor ` +
        `— the rewrite buffered the whole stream`,
    );
  }
  log("");
  if (problems.length > 0) {
    log(`FAILED: ${problems.join("; ")}`);
    return false;
  }
  log(
    `PASSED: frames arrived one at a time, spread over ${spread} ms through proxy.ts and the rewrite.`,
  );
  return true;
}

const origin = await stubOrigin();
let web;
try {
  await build();
  web = await startWeb();
  const passed = report(await probe());
  process.exitCode = passed ? 0 : 1;
} finally {
  if (web?.pid) {
    try {
      process.kill(-web.pid, "SIGTERM");
    } catch {
      web.kill("SIGTERM");
    }
  }
  // `close()` alone stops listening and then waits for keep-alive connections that nothing will
  // ever use again — the readiness probe leaves one — so the script would hang after reporting.
  origin.closeAllConnections();
  origin.close();
}
