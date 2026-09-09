import type { AuthToken } from '../lib/jwt.js';

export type AppEnv = {
  Variables: {
    /** Populated by the auth middleware after JWT + revocation checks. */
    auth: AuthToken;
    /** Populated by validateJson. */
    body: unknown;
    /** Set after a WebSocket upgrade request passes document authorization. */
    wsDocumentId: string;
  };
};
