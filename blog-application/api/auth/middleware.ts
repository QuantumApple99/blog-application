import type { RequestHandler } from 'express';
import type { Database } from 'better-sqlite3';
import { ApiError } from '../errors';
import { getSessionUser, type SessionUser } from './sessions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export function loadUser(db: Database): RequestHandler {
  return (req, _res, next) => {
    try {
      const sid = (req.cookies as Record<string, unknown> | undefined)?.['sid'];
      if (typeof sid === 'string' && /^[0-9a-f]{64}$/.test(sid)) {
        const user = getSessionUser(db, sid);
        if (user) req.user = user;
      }
    } catch {
      // a bad cookie or lookup failure must never break the request
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Authentication required'));
  next();
};
