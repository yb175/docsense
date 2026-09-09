import assert from 'node:assert/strict';
import { prisma } from '../src/db/prisma.js';
import { createDocument } from '../src/services/document.service.js';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer << /Root 1 0 R >>\nstartxref\n0\n%%EOF\n');
const ownerId = (await prisma.user.create({
  data: {
    name: 'Document Integration Test',
    email: `document-integration-${Date.now()}@example.test`,
    passwordHash: 'unused',
    emailVerified: true,
  },
})).id;

try {
  const document = await createDocument({ ownerId, filename: 'Integration.pdf', bytes: pdf });
  assert.equal(document.filename, 'Integration.pdf');
  assert.equal(document.mimeType, 'application/pdf');
  assert.equal(document.sizeBytes, pdf.length);

  const stored = await prisma.document.findUnique({ where: { id: document.id } });
  assert.ok(stored);
  assert.equal(stored.ownerId, ownerId);
  await assert.rejects(
    createDocument({ ownerId, filename: 'integration.PDF', bytes: pdf }),
    /already exists/,
  );

  const failedDocumentId = crypto.randomUUID();
  await assert.rejects(
    createDocument({ ownerId: crypto.randomUUID(), filename: 'orphan.pdf', bytes: pdf, documentId: failedDocumentId }),
  );
  console.log('document integration checks: OK');
} finally {
  await prisma.user.delete({ where: { id: ownerId } });
  await prisma.$disconnect();
}
