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
export class ApplicationError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
