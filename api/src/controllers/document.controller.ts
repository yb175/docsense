import type { Context } from 'hono';

import { badRequest, payloadTooLarge, unsupportedMediaType } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { createDocument, isPdf } from '../services/document.service.js';
import type { AppEnv } from '../types/index.js';

function sanitizeFilename(filename: string): string {
  const value = filename.normalize('NFKC').trim();
  if (!value || value.length > 255 || /[\\/\0\r\n]/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw badRequest('Invalid filename');
  }
  return value;
}

export async function uploadDocument(c: Context<AppEnv>) {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw badRequest('Invalid multipart request');
  }

  const value = form.get('file');
  if (!(value instanceof File)) throw badRequest('A file is required');

  const filename = sanitizeFilename(value.name);
  if (value.size > env.MAX_PDF_SIZE_BYTES) {
    throw payloadTooLarge('PDF exceeds the maximum allowed size');
  }

  const bytes = Buffer.from(await value.arrayBuffer());
  if (bytes.length > env.MAX_PDF_SIZE_BYTES) {
    throw payloadTooLarge('PDF exceeds the maximum allowed size');
  }
  if (!isPdf(bytes)) throw unsupportedMediaType();

  const document = await createDocument({
    ownerId: c.get('auth').userId,
    filename,
    bytes,
  });
  return c.json(document, 201);
}
