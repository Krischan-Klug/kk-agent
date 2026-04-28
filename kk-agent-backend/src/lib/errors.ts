export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;

  constructor(message: string, options: { statusCode?: number; code?: string; expose?: boolean } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "APP_ERROR";
    this.expose = options.expose ?? this.statusCode < 500;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} "${id}" not found` : `${resource} not found`, {
      statusCode: 404,
      code: "NOT_FOUND",
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(`Validation failed: ${message}`, {
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, {
      statusCode: 409,
      code: "CONFLICT",
    });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, {
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  }
}
