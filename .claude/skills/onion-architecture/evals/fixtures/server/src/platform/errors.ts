export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(code = 'not_found') {
    super(code, 404);
    this.name = 'NotFoundError';
  }
}

export class ConfigError extends AppError {
  constructor(code: string) {
    super(code, 500);
    this.name = 'ConfigError';
  }
}
