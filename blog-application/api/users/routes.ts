import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { ApiError } from '../errors';
import { requireAuth } from '../auth/middleware';
import { toMe, toPublicUser, type UserRow } from '../auth/shapes';
import { isRecord, validBio, validDisplayName, type Fields } from '../auth/validate';
import { listPublishedPostsByAuthor, parsePage } from './posts-source';

const USER_COLS = 'id, username, email, display_name, bio, created_at';

export function usersRouter(db: Database): Router {
  const r = Router();

  // Registered before /:username so "me" is never treated as a username.
  r.patch('/me', requireAuth, (req, res, next) => {
    try {
      const b: Record<string, unknown> = isRecord(req.body) ? req.body : {};
      const fields: Fields = {};
      let displayName: string | undefined;
      let bio: string | undefined;
      let recognised = 0;
      if ('displayName' in b) {
        recognised++;
        const v = validDisplayName(b['displayName']);
        if (v === null) fields['displayName'] = 'Display name must be 1-50 characters';
        else displayName = v;
      }
      if ('bio' in b) {
        recognised++;
        const v = validBio(b['bio']);
        if (v === null) fields['bio'] = 'Bio must be a string of at most 500 characters';
        else bio = v;
      }
      if (recognised === 0) throw new ApiError(400, 'VALIDATION', 'Provide displayName and/or bio', { displayName: 'Provide displayName and/or bio' });
      if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION', 'Invalid input', fields);

      const id = req.user!.id;
      if (displayName !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, id);
      if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, id);
      const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as UserRow;
      res.status(200).json({ user: toMe(row) });
    } catch (e) {
      next(e);
    }
  });

  const find = (param: unknown): UserRow => {
    const name = typeof param === 'string' ? param.trim().toLowerCase() : '';
    const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`).get(name) as UserRow | undefined;
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'User not found');
    return row;
  };

  r.get('/:username', (req, res, next) => {
    try {
      res.status(200).json({ user: toPublicUser(find(req.params['username'])) });
    } catch (e) {
      next(e);
    }
  });

  r.get('/:username/posts', (req, res, next) => {
    try {
      const user = find(req.params['username']);
      const page = parsePage(req.query);
      res.status(200).json(listPublishedPostsByAuthor(db, user.id, page));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
