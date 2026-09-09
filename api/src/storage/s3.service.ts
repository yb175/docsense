import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { env } from '../lib/env.js';

const client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function uploadPdf(storageKey: string, body: Buffer): Promise<void> {
  await client.send(new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: storageKey,
    Body: body,
    ContentType: 'application/pdf',
    ServerSideEncryption: 'AES256',
  }));
}

export async function downloadPdf(storageKey: string): Promise<{ body: ReadableStream<Uint8Array>; contentType?: string }> {
  const result = await client.send(new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: storageKey }));
  if (!result.Body) throw new Error('Stored document has no content');
  return { body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>, contentType: result.ContentType };
}

export async function deleteObject(storageKey: string): Promise<void> {
  await client.send(new DeleteObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: storageKey,
  }));
}
