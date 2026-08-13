import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const TOKEN_HEADER = "x-kk-agent-token";

function readExpectedToken(): string | undefined {
  const token = process.env.KK_AGENT_API_TOKEN?.trim();
  return token && token.length > 0 ? token : undefined;
}

function readRequestToken(req: Request): string | undefined {
  const headerToken = req.header(TOKEN_HEADER)?.trim();
  if (headerToken) return headerToken;

  const auth = req.header("authorization")?.trim();
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }

  return undefined;
}

function tokensEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireLocalApiToken(req: Request, res: Response, next: NextFunction): void {
  const expected = readExpectedToken();
  if (!expected) {
    next();
    return;
  }

  const actual = readRequestToken(req);
  if (actual && tokensEqual(actual, expected)) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
