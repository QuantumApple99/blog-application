import express, { Router, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import type { Database } from 'better-sqlite3';
import { ApiError, errorHandler, notFound } from './errors';
import { authRouter, loadUser, usersRouter } from './auth';
import { postsRouter } from './posts';

const jsonGuard: RequestHandler = (req, _res, next) => {
  if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
    const len = Number(req.headers['content-length'] ?? 0);
    const hasBody = len > 0 || req.headers['transfer-encoding'] !== undefined;
    if (hasBody && !req.is('application/json')) {
      return next(ApiError.validation({ _: 'Content-Type must be application/json' }, 'Content-Type must be application/json'));
    }
  }
  next();
};

export function createApi({ db }: { db: Database }): express.Router {
  const api = Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  api.use(express.json({ limit: '100kb' }));
  api.use(cookieParser());
  api.use(jsonGuard);
  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  api.use(loadUser(db));
  api.use('/auth', authRouter(db));
  api.use('/users', usersRouter(db));
  api.use('/', postsRouter(db));
  api.use(notFound);
  api.use(errorHandler);
  return api;
}
