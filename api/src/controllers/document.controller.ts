import type { Context } from 'hono';

import { badRequest, payloadTooLarge, unsupportedMediaType } from '../lib/errors.js';
import { env } from '../lib/env.js';
import { createDocument, isPdf, listDocuments, removeDocument } from '../services/document.service.js';
import { authorizeDocument } from '../services/share.service.js';
import { getCookie } from 'hono/cookie';
import { downloadPdf } from '../storage/s3.service.js';
import { prisma } from '../db/prisma.js';
import { processDocument, startDocumentProcessing } from '../ai/ai.service.js';
import type { AppEnv } from '../types/index.js';

function sanitizeFilename(filename: string): string {
  const value = filename.normalize('NFKC').trim();
  if (!value || value.length > 255 || /[\\/\0\r\n]/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw badRequest('Invalid filename');
  }
  return value;
}

export async function listOwnedDocuments(c: Context<AppEnv>) {
  return c.json({ documents: await listDocuments(c.get('auth').userId) });
}

export async function getDocument(c: Context<AppEnv>) {
  const sessionId = getCookie(c, 'docsense_guest_session');
  const access = await authorizeDocument(c.req.param('documentId')!, { userId: c.get('auth')?.userId, sessionId });
  const { storageKey: _storageKey, ...document } = access.document;
  return c.json({ document, access: access.kind });
}

export async function getDocumentSummary(c: Context<AppEnv>) {
  const documentId = c.req.param('documentId')!;
  await authorizeDocument(documentId, { userId: c.get('auth')?.userId, sessionId: getCookie(c, 'docsense_guest_session') });
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { aiSummary: true, processingStatus: true } });
  return c.json({ summary: document?.aiSummary ?? null, processingStatus: document?.processingStatus ?? null });
}

export async function getDocumentContent(c: Context<AppEnv>) {
  const sessionId = getCookie(c, 'docsense_guest_session');
  const access = await authorizeDocument(c.req.param('documentId')!, { userId: c.get('auth')?.userId, sessionId });
  const file = await downloadPdf(access.document.storageKey);
  return new Response(file.body as BodyInit, { headers: { 'Content-Type': file.contentType ?? 'application/pdf', 'Content-Disposition': `inline; filename="${access.document.filename.replace(/"/gu, '')}"`, 'Cache-Control': 'private, no-store' } });
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

  console.info(`[ai:upload] validating PDF filename=${filename} bytes=${bytes.length}`);
  const document = await createDocument({
    ownerId: c.get('auth').userId,
    filename,
    bytes,
  });
  const started = await startDocumentProcessing(document.id);
  if (!started) {
    const current = await prisma.document.findUnique({ where: { id: document.id }, select: { processingStatus: true } });
    if (current?.processingStatus !== 'PROCESSING') {
      await removeDocument(document.id);
      throw new Error(`Unable to start processing document ${document.id}`);
    }
  }
  console.info(`[ai:upload] stored document=${document.id} status=PROCESSING`);
  if (started) void processDocument(document.id, bytes);
  return c.json({ ...document, processingStatus: 'PROCESSING' }, 201);
}
