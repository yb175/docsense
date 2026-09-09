import assert from 'node:assert/strict';

import { isPdf, normalizeFilename } from '../src/services/document.service.js';

assert.equal(normalizeFilename('  Contract  FINAL.PDF '), 'contract final.pdf');
assert.equal(normalizeFilename('CONTRACT FINAL.pdf'), 'contract final.pdf');
const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer << /Root 1 0 R >>\nstartxref\n0\n%%EOF\n');
assert.equal(isPdf(validPdf), true);
assert.equal(isPdf(Buffer.from('not a pdf\n%%EOF\n')), false);
assert.equal(isPdf(Buffer.from('%PDF-1.7\nbody\n%%EOF\n')), false);

console.log('document unit checks: OK');
