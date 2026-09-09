import { Hono } from 'hono';
import { z } from 'zod';

import { createShareHandler, guestLogoutHandler, listSharesHandler, requestGuestOtpHandler, revokeShareHandler, verifyGuestOtpHandler } from '../controllers/share.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateJson } from '../middleware/validation.js';
import type { AppEnv } from '../types/index.js';

const email = z.string().trim().toLowerCase().pipe(z.email());
const createShareSchema = z.object({ inviteeEmail: email, inviteeName: z.string().trim().min(1).max(100) });
const guestOtpRequestSchema = z.object({ token: z.string().min(32), email });
const guestOtpVerifySchema = guestOtpRequestSchema.extend({ otp: z.string().regex(/^\d{6}$/) });

export const shareRoutes = new Hono<AppEnv>();

shareRoutes.post('/documents/:documentId/shares', requireAuth, validateJson(createShareSchema), createShareHandler);
shareRoutes.get('/documents/:documentId/shares', requireAuth, listSharesHandler);
shareRoutes.delete('/documents/:documentId/shares/:shareId', requireAuth, revokeShareHandler);
shareRoutes.post('/shares/request-otp', validateJson(guestOtpRequestSchema), requestGuestOtpHandler);
shareRoutes.post('/shares/verify-otp', validateJson(guestOtpVerifySchema), verifyGuestOtpHandler);
shareRoutes.post('/guest-session/logout', guestLogoutHandler);
