export type ErrorCode =
  | 'INVALID_INPUT'
  | 'SESSION_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'RATE_LIMIT'
  | 'UPSTREAM_INVALID'
  | 'UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT';
const APPLICATION_ERROR_BRAND = Symbol.for('tourpass.ApplicationError');

export class ApplicationError extends Error {
  readonly [APPLICATION_ERROR_BRAND] = true;

  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }

  static [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      (APPLICATION_ERROR_BRAND in value ||
        Object.prototype.isPrototypeOf.call(ApplicationError.prototype, value))
    );
  }
}
