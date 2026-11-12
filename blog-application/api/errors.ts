import type { ErrorRequestHandler, RequestHandler } from 'express';

export type Code =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'INTERNAL';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: Code,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static validation(fields: Record<string, string>, message = 'Invalid input'): ApiError {
    return new ApiError(400, 'VALIDATION', message, fields);
  }
  static unauthenticated(): ApiError {
    return new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  static forbidden(): ApiError {
    return new ApiError(403, 'FORBIDDEN', 'Forbidden');
  }
  static notFound(): ApiError {
    return new ApiError(404, 'NOT_FOUND', 'Not found');
  }
}

function send(
  res: Parameters<ErrorRequestHandler>[2],
  status: number,
  code: Code,
  message: string,
  fields?: Record<string, string>,
): void {
  const error: { code: Code; message: string; fields?: Record<string, string> } = { code, message };
  if (fields !== undefined) error.fields = fields;
  res.status(status).json({ error });
}

export const notFound: RequestHandler = (_req, res) => {
  send(res, 404, 'NOT_FOUND', 'Not found');
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    send(res, err.status, err.code, err.message, err.fields);
    return;
  }
  const type = (err as { type?: unknown } | null)?.type;
  if (type === 'entity.parse.failed') {
    send(res, 400, 'VALIDATION', 'Malformed JSON');
    return;
  }
  if (type === 'entity.too.large') {
    send(res, 400, 'VALIDATION', 'Request body too large');
    return;
  }
  console.error(err);
  send(res, 500, 'INTERNAL', 'Internal server error');
};
