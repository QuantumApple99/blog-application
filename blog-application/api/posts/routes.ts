import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Database } from 'better-sqlite3';
import { ApiError } from '../errors';
// Imported from the middleware module (not '../auth' index) to avoid an import cycle:
// auth/index -> users/routes -> users/posts-source -> posts/index -> posts/routes.
import { requireAuth } from '../auth/middleware';
import { createPost, deletePost, findBySlug, listByAuthor, listPublished, toPost, updatePost, type Status } from './repo';
import { parsePage } from './page';

type Fields = Record<string, string>;

const wrap =
  (fn: (req: Request, res: Response) => void): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      fn(req, res);
    } catch (e) {
      next(e);
    }
  };

const isStatus = (v: unknown): v is Status => v === 'draft' || v === 'published';

function checkTitle(v: unknown, fields: Fields): string | undefined {
  if (typeof v !== 'string' || v.trim().length < 1 || v.trim().length > 200) {
    fields['title'] = 'Title must be 1-200 characters';
    return undefined;
  }
  return v.trim();
}
function checkBody(v: unknown, fields: Fields): string | undefined {
  if (typeof v !== 'string' || v.length > 100000) {
    fields['body'] = 'Body must be a string of at most 100000 characters';
    return undefined;
  }
  return v;
}
function checkStatus(v: unknown, fields: Fields): Status | undefined {
  if (!isStatus(v)) {
    fields['status'] = 'Status must be draft or published';
    return undefined;
  }
  return v;
}

function bodyRecord(req: Request): Record<string, unknown> {
  const b: unknown = req.body;
  return typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

export function postsRouter(db: Database): Router {
  const r = Router();

  r.get(
    '/posts',
    wrap((req, res) => {
      const page = parsePage(req.query);
      res.json(listPublished(db, { page }));
    }),
  );

  r.get(
    '/me/posts',
    requireAuth,
    wrap((req, res) => {
      const page = parsePage(req.query);
      const rawStatus = req.query['status'];
      let status: Status | undefined;
      if (rawStatus !== undefined) {
        if (!isStatus(rawStatus)) throw ApiError.validation({ status: 'Status must be draft or published' });
        status = rawStatus;
      }
      const user = req.user as NonNullable<Request['user']>;
      res.json(listByAuthor(db, user.id, status ? { status, page } : { page }));
    }),
  );

  r.get(
    '/posts/:slug',
    wrap((req, res) => {
      const row = findBySlug(db, String(req.params['slug']));
      if (!row || (row.status === 'draft' && req.user?.id !== row.author_id)) throw ApiError.notFound();
      res.json({ post: toPost(row) });
    }),
  );

  r.post(
    '/posts',
    requireAuth,
    wrap((req, res) => {
      const b = bodyRecord(req);
      const fields: Fields = {};
      const title = checkTitle(b['title'], fields);
      const body = checkBody(b['body'], fields);
      const status = checkStatus(b['status'], fields);
      if (Object.keys(fields).length > 0 || title === undefined || body === undefined || status === undefined) {
        throw ApiError.validation(fields);
      }
      const user = req.user as NonNullable<Request['user']>;
      const row = createPost(db, { authorId: user.id, title, body, status });
      res.status(201).json({ post: toPost(row) });
    }),
  );

  r.patch(
    '/posts/:slug',
    requireAuth,
    wrap((req, res) => {
      const row = findBySlug(db, String(req.params['slug']));
      if (!row) throw ApiError.notFound();
      if (row.author_id !== req.user?.id) throw ApiError.forbidden();
      const b = bodyRecord(req);
      const fields: Fields = {};
      const changes: { title?: string; body?: string; status?: Status } = {};
      let known = 0;
      if ('title' in b) {
        known++;
        const v = checkTitle(b['title'], fields);
        if (v !== undefined) changes.title = v;
      }
      if ('body' in b) {
        known++;
        const v = checkBody(b['body'], fields);
        if (v !== undefined) changes.body = v;
      }
      if ('status' in b) {
        known++;
        const v = checkStatus(b['status'], fields);
        if (v !== undefined) changes.status = v;
      }
      if (known === 0) throw ApiError.validation({ _: 'Provide at least one of title, body, status' });
      if (Object.keys(fields).length > 0) throw ApiError.validation(fields);
      res.json({ post: toPost(updatePost(db, row, changes)) });
    }),
  );

  r.delete(
    '/posts/:slug',
    requireAuth,
    wrap((req, res) => {
      const row = findBySlug(db, String(req.params['slug']));
      if (!row) throw ApiError.notFound();
      if (row.author_id !== req.user?.id) throw ApiError.forbidden();
      deletePost(db, row.id);
      res.status(204).end();
    }),
  );

  return r;
}
