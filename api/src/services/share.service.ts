import { createHash, randomBytes } from 'node:crypto';
import { DocumentShareStatus } from '@prisma/client';

import { prisma } from '../db/prisma.js';
import { guestSessionKey, redis, shareOtpKey } from '../db/redis.js';
import { badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { EMAIL_OTP_TTL_SECONDS, generateOtp, hashOtp, verifyOtp } from '../lib/otp.js';
import { env } from '../lib/env.js';
import { emailSender } from './email.service.js';

export const SHARE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const GUEST_SESSION_TTL_SECONDS = 24 * 60 * 60;
export const GUEST_PERMISSIONS = ['VIEW'] as const;
export type GuestPermission = typeof GUEST_PERMISSIONS[number];

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
const assertUuid = (value: string) => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) throw badRequest('Invalid document id'); };
export const hashShareToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const generateShareToken = () => randomBytes(32).toString('base64url');

function activeShare(share: { status: DocumentShareStatus; expiresAt: Date | null }) {
  if (share.status === DocumentShareStatus.REVOKED || share.status === DocumentShareStatus.EXPIRED) {
    throw forbidden('This share is no longer active');
  }
  if (share.expiresAt && share.expiresAt <= new Date()) {
    throw forbidden('This share has expired');
  }
}

export async function createShare(input: { documentId: string; ownerId: string; inviteeEmail: string; inviteeName: string }) {
  assertUuid(input.documentId);
  const document = await prisma.document.findFirst({ where: { id: input.documentId, ownerId: input.ownerId }, select: { id: true, filename: true } });
  if (!document) throw forbidden('Only the document owner can create shares');

  const token = generateShareToken();
  const expiresAt = new Date(Date.now() + SHARE_TTL_SECONDS * 1000);
  const share = await prisma.documentShare.create({
    data: {
      documentId: document.id,
      inviteeEmail: normalizeEmail(input.inviteeEmail),
      inviteeName: input.inviteeName.trim(),
      tokenHash: hashShareToken(token),
      expiresAt,
    },
    select: { id: true, documentId: true, inviteeEmail: true, inviteeName: true, status: true, createdAt: true, expiresAt: true },
  });

  const link = `${env.APP_URL.replace(/\/$/u, '')}/#/share/${token}`;
  try {
    await emailSender.send({
      to: share.inviteeEmail,
      subject: `Shared PDF: ${document.filename}`,
      text: `Hi ${share.inviteeName},\n\nYou have been invited to view ${document.filename} in Docsense.\nOpen this link to verify your email and access the PDF:\n${link}\n\nThis link expires in 7 days.`,
    });
  } catch (error) {
    await prisma.documentShare.delete({ where: { id: share.id } }).catch(() => undefined);
    throw error;
  }

  return { ...share, shareUrl: link };
}

export async function listShares(documentId: string, ownerId: string) {
  assertUuid(documentId);
  const document = await prisma.document.findFirst({ where: { id: documentId, ownerId }, select: { id: true } });
  if (!document) throw forbidden('Only the document owner can view shares');
  return prisma.documentShare.findMany({ where: { documentId }, orderBy: { createdAt: 'desc' }, select: { id: true, inviteeEmail: true, inviteeName: true, status: true, createdAt: true, expiresAt: true, acceptedAt: true } });
}

export async function revokeShare(input: { documentId: string; shareId: string; ownerId: string }) {
  assertUuid(input.documentId); assertUuid(input.shareId);
  const share = await prisma.documentShare.findFirst({ where: { id: input.shareId, documentId: input.documentId, document: { ownerId: input.ownerId } }, select: { id: true } });
  if (!share) throw forbidden('Only the document owner can revoke shares');
  return prisma.documentShare.update({ where: { id: share.id }, data: { status: DocumentShareStatus.REVOKED }, select: { id: true, status: true } });
}

async function findShare(token: string) {
  if (!token || token.length < 32) throw unauthorized('Invalid share link');
  const share = await prisma.documentShare.findUnique({ where: { tokenHash: hashShareToken(token) } });
  if (!share) throw unauthorized('Invalid share link');
  activeShare(share);
  return share;
}

export async function requestGuestOtp(input: { token: string; email: string }) {
  const share = await findShare(input.token);
  if (normalizeEmail(input.email) !== share.inviteeEmail) throw forbidden('This email is not invited to the document');
  const otp = generateOtp();
  await redis.set(shareOtpKey(share.id), hashOtp(otp), 'EX', EMAIL_OTP_TTL_SECONDS);
  await emailSender.send({ to: share.inviteeEmail, subject: 'Your Docsense guest verification code', text: `Your verification code is ${otp}. It expires in 3 minutes and can be used once.` });
  return { message: 'Verification code sent' };
}

export async function verifyGuestOtp(input: { token: string; email: string; otp: string }) {
  const share = await findShare(input.token);
  if (normalizeEmail(input.email) !== share.inviteeEmail) throw forbidden('This email is not invited to the document');
  const storedHash = await redis.getdel(shareOtpKey(share.id));
  if (!storedHash || !verifyOtp(input.otp, storedHash)) throw badRequest('The verification code is invalid or has expired');

  const sessionId = randomBytes(32).toString('base64url');
  const ttl = Math.min(GUEST_SESSION_TTL_SECONDS, share.expiresAt ? Math.max(1, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)) : GUEST_SESSION_TTL_SECONDS);
  await redis.set(guestSessionKey(sessionId), JSON.stringify({ shareId: share.id, documentId: share.documentId, inviteeEmail: share.inviteeEmail, permissions: GUEST_PERMISSIONS, expiresAt: new Date(Date.now() + ttl * 1000).toISOString() }), 'EX', ttl);
  await prisma.documentShare.update({ where: { id: share.id }, data: { status: DocumentShareStatus.ACCEPTED, acceptedAt: share.acceptedAt ?? new Date() } });
  return { sessionId, maxAge: ttl, documentId: share.documentId };
}

export type GuestSession = { shareId: string; documentId: string; inviteeEmail: string; permissions: GuestPermission[]; expiresAt: string };

export async function getGuestSession(sessionId: string | undefined): Promise<GuestSession | null> {
  if (!sessionId) return null;
  const value = await redis.get(guestSessionKey(sessionId));
  if (!value) return null;
  try {
    return JSON.parse(value) as GuestSession;
  } catch {
    return null;
  }
}

/** Returns the document only when this browser's guest session belongs to the link. */
export async function getGuestSessionDocument(token: string, sessionId: string | undefined) {
  const [share, session] = await Promise.all([findShare(token), getGuestSession(sessionId)]);
  if (!session || session.shareId !== share.id || session.documentId !== share.documentId) return null;
  return session.documentId;
}

export async function authorizeDocument(documentId: string, input: { userId?: string; sessionId?: string }) {
  assertUuid(documentId);
  if (input.userId) {
    const ownerDocument = await prisma.document.findFirst({ where: { id: documentId, ownerId: input.userId }, select: { id: true, filename: true, sizeBytes: true, mimeType: true, createdAt: true, storageKey: true } });
    if (ownerDocument) return { kind: 'owner' as const, document: ownerDocument };
  }
  const session = await getGuestSession(input.sessionId);
  if (!session || session.documentId !== documentId) throw forbidden('You do not have access to this document');
  const share = await prisma.documentShare.findUnique({ where: { id: session.shareId }, select: { status: true, expiresAt: true } });
  if (!share) throw forbidden('You do not have access to this document');
  activeShare(share);
  const document = await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, filename: true, sizeBytes: true, mimeType: true, createdAt: true, storageKey: true } });
  if (!document) throw forbidden('You do not have access to this document');
  return { kind: 'guest' as const, document, session };
}

