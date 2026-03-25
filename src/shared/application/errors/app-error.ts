export class AppError extends Error {
  constructor(
    message: string,
    public readonly kind: "validation" | "not_found" | "conflict" | "forbidden" | "unauthorized"
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AppValidationError extends AppError {
  constructor(message: string) {
    super(message, "validation");
  }
}

export class AppNotFoundError extends AppError {
  constructor(message: string) {
    super(message, "not_found");
  }
}

export class AppConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict");
  }
}

export class AppForbiddenError extends AppError {
  constructor(message: string) {
    super(message, "forbidden");
  }
}

export class AppUnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, "unauthorized");
  }
}
