import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors.js";

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const messages = err.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    res.status(400).json({ error: `Validation error: ${messages}` });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.expose ? err.message : "Internal server error" });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}
