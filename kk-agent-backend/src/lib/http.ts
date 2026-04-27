import type { Request } from "express";
import { BadRequestError } from "./errors.js";

export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new BadRequestError(`Missing route parameter "${name}"`);
}
