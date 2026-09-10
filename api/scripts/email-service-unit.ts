import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unused';
process.env.REDIS_URL = 'redis://unused';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'unused';
process.env.AWS_SECRET_ACCESS_KEY = 'unused';
process.env.AWS_S3_BUCKET = 'unused';
process.env.MAX_PDF_SIZE_BYTES = '1';
process.env.MAIL_FROM = 'DocSense <test@example.com>';

const { ResendEmailSender } = await import('../src/services/email.service.js');
let request: RequestInit | undefined;
const sender = new ResendEmailSender('test-key', async (_url, init) => {
  request = init;
  return new Response(null, { status: 200 });
});

await sender.send({ to: 'reviewer@example.com', subject: 'OTP', text: '123456' });
assert.equal((request?.headers as Record<string, string>).Authorization, 'Bearer test-key');
assert.deepEqual(JSON.parse(String(request?.body)), {
  from: 'DocSense <test@example.com>', to: ['reviewer@example.com'], subject: 'OTP', text: '123456',
});

await assert.rejects(
  () => new ResendEmailSender('test-key', async () => new Response(null, { status: 401 })).send({ to: 'a@example.com', subject: 'x', text: 'x' }),
  /Resend email request failed \(401\)/,
);

console.log('Email service unit checks: OK');
