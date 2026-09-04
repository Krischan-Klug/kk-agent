import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const HOST_TOKEN_HEADER = "x-kk-agent-host-token";

function tokensEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireDesktopHostToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.KK_AGENT_HOST_TOKEN?.trim();
  const actual = req.header(HOST_TOKEN_HEADER)?.trim();
  if (expected && actual && tokensEqual(actual, expected)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
