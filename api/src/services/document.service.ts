import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { conflict, internalServerError } from '../lib/errors.js';
import { deleteObject, uploadPdf } from '../storage/s3.service.js';

export const DOCUMENT_MIME_TYPE = 'application/pdf';

export function normalizeFilename(filename: string): string {
  return filename.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function isPdf(bytes: Buffer): boolean {
  const content = bytes.toString('latin1');
  return /^%PDF-\d\.\d(?:\r?\n)/.test(content)
    && /(?:^|\r?\n)trailer\s*<<[\s\S]*?\/Root\s+\d+\s+\d+\s+R/.test(content)
    && /startxref\s+\d+\s+%%EOF\s*$/.test(content);
}

export async function createDocument(input: {
  ownerId: string;
  filename: string;
  bytes: Buffer;
  documentId?: string;
}) {
  const normalizedFilename = normalizeFilename(input.filename);
  const duplicate = await prisma.document.findUnique({
    where: { ownerId_normalizedFilename: { ownerId: input.ownerId, normalizedFilename } },
    select: { id: true },
  });
  if (duplicate) throw conflict('A document with this filename already exists');

  const id = input.documentId ?? randomUUID();
  const storageKey = `private/spot-draft/documents/${id}.pdf`;

  await uploadPdf(storageKey, input.bytes);
  try {
    return await prisma.document.create({
      data: {
        id,
        ownerId: input.ownerId,
        filename: input.filename,
        normalizedFilename,
        storageKey,
        sizeBytes: input.bytes.length,
        mimeType: DOCUMENT_MIME_TYPE,
      },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
      },
    });
  } catch (error) {
    await deleteObject(storageKey).catch((cleanupError) => {
      console.error('Failed to clean up uploaded document object', cleanupError);
    });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw conflict('A document with this filename already exists');
    }
    throw internalServerError();
  }
}
