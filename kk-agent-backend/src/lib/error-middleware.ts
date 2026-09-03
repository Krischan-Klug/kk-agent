import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "./errors.js";
import { createLogger } from "./logger.js";

const logger = createLogger("http");

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

  if (err instanceof multer.MulterError) {
    const fileSizeExceeded = err.code === "LIMIT_FILE_SIZE";
    const message = fileSizeExceeded
      ? "Uploaded file exceeds the allowed size."
      : err.code === "LIMIT_FILE_COUNT"
        ? "Too many files were uploaded."
        : err.code === "LIMIT_UNEXPECTED_FILE"
          ? "The upload contains an unexpected file field or too many files."
          : err.message;
    res.status(fileSizeExceeded ? 413 : 400).json({ error: message });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error("Request failed:", err);
    res.status(err.statusCode).json({ error: err.expose ? err.message : "Internal server error" });
    return;
  }

  logger.error("Unhandled request error:", err);
  res.status(500).json({ error: "Internal server error" });
}
