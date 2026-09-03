import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { errorMiddleware } from "./error-middleware.js";

function captureResponse(error: Error): { status: number; body: unknown } {
  const captured: { status: number; body: unknown } = { status: 0, body: undefined };
  const response = {
    status(status: number) {
      captured.status = status;
      return response;
    },
    json(body: unknown) {
      captured.body = body;
      return response;
    },
  } as unknown as Response;

  errorMiddleware(error, {} as Request, response, (() => undefined) as NextFunction);
  return captured;
}

test("maps oversized multipart files to a public 413 response", () => {
  const result = captureResponse(new multer.MulterError("LIMIT_FILE_SIZE"));
  assert.deepEqual(result, {
    status: 413,
    body: { error: "Uploaded file exceeds the allowed size." },
  });
});

test("maps multipart file-count failures to a public 400 response", () => {
  const result = captureResponse(new multer.MulterError("LIMIT_FILE_COUNT"));
  assert.deepEqual(result, {
    status: 400,
    body: { error: "Too many files were uploaded." },
  });
});
