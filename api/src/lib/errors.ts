import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Error whose message is safe to return to API clients. */
export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const conflict = (message: string) => new HttpError(409, message);
export const payloadTooLarge = (message = 'Payload Too Large') => new HttpError(413, message);
export const unsupportedMediaType = (message = 'Only valid PDF files are supported') => new HttpError(415, message);
export const internalServerError = (message = 'Internal Server Error') => new HttpError(500, message);
