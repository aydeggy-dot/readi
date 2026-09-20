import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const CLIENT_IP_HEADER = "x-readi-client-ip";
export const PROXY_SECRET_HEADER = "x-readi-proxy-secret";

function sameSecret(received: string | string[] | undefined, expected: string): boolean {
  if (typeof received !== "string") return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Express middleware (before Better Auth): keeps the client IP header only when the request carries
 * the web proxy's secret, so a client can never choose its own rate-limit bucket (ADR-0009).
 * The secret itself is always removed before the request goes further.
 */
export function trustedClientIp(secret: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const trusted = secret !== undefined && sameSecret(req.headers[PROXY_SECRET_HEADER], secret);
    delete req.headers[PROXY_SECRET_HEADER];
    if (!trusted) delete req.headers[CLIENT_IP_HEADER];
    next();
  };
}
