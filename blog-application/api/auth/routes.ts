import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import { ApiError } from '../errors';
import { hashPassword, verifyPassword, getDummyHash } from './password';
import { createSession, deleteSession } from './sessions';
import { setSessionCookie, clearSessionCookie } from './cookie';
import { toMe, meFromSession, type UserRow } from './shapes';
import { USERNAME_RE, isRecord, validDisplayName, type Fields } from './validate';

const USER_COLS = 'id, username, email, display_name, bio, created_at';

function sidOf(req: { cookies?: unknown }): string | null {
  const c = req.cookies as Record<string, unknown> | undefined;
  const v = c?.['sid'];
  return typeof v === 'string' ? v : null;
}

export function authRouter(db: Database): Router {
  const r = Router();

  r.post('/signup', async (req, res, next) => {
    try {
      const b: Record<string, unknown> = isRecord(req.body) ? req.body : {};
      const fields: Fields = {};
      const username = typeof b['username'] === 'string' ? b['username'].trim().toLowerCase() : '';
      if (!USERNAME_RE.test(username)) fields['username'] = 'Username must be 3-20 characters: lowercase letters, numbers, underscore';
      const email = typeof b['email'] === 'string' ? b['email'].trim().toLowerCase() : '';
      if (!email.includes('@') || email.length > 254) fields['email'] = 'A valid email address is required (max 254 characters)';
      const displayName = validDisplayName(b['displayName']);
      if (displayName === null) fields['displayName'] = 'Display name must be 1-50 characters';
      const password = b['password'];
      if (typeof password !== 'string' || password.length < 8 || password.length > 200)
        fields['password'] = 'Password must be 8-200 characters';
      if (Object.keys(fields).length || typeof password !== 'string' || displayName === null)
        throw new ApiError(400, 'VALIDATION', 'Invalid input', fields);

      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username))
        throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already taken');
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
        throw new ApiError(409, 'EMAIL_TAKEN', 'Email is already registered');

      const hash = await hashPassword(password);
      let id: number;
      try {
        const info = db
          .prepare('INSERT INTO users (username, email, display_name, bio, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(username, email, displayName, '', hash, new Date().toISOString());
        id = Number(info.lastInsertRowid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('UNIQUE') && msg.includes('users.email')) throw new ApiError(409, 'EMAIL_TAKEN', 'Email is already registered');
        if (msg.includes('UNIQUE') && msg.includes('users.username')) throw new ApiError(409, 'USERNAME_TAKEN', 'Username is already taken');
        throw e;
      }
      const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as UserRow;
      const old = sidOf(req);
      if (old) deleteSession(db, old);
      const s = createSession(db, id);
      setSessionCookie(res, s.id);
      res.status(201).json({ user: toMe(row) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/login', async (req, res, next) => {
    try {
      const b: Record<string, unknown> = isRecord(req.body) ? req.body : {};
      const fields: Fields = {};
      if (typeof b['username'] !== 'string' || b['username'].trim() === '') fields['username'] = 'Username or email is required';
      if (typeof b['password'] !== 'string' || b['password'] === '') fields['password'] = 'Password is required';
      if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION', 'Invalid input', fields);
      const ident = (b['username'] as string).trim().toLowerCase();
      const password = b['password'] as string;

      const col = ident.includes('@') ? 'email' : 'username';
      const row = db.prepare(`SELECT ${USER_COLS}, password_hash FROM users WHERE ${col} = ?`).get(ident) as
        | (UserRow & { password_hash: string })
        | undefined;
      const ok = await verifyPassword(password, row ? row.password_hash : await getDummyHash());
      if (!row || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');

      const old = sidOf(req);
      if (old) deleteSession(db, old);
      const s = createSession(db, row.id);
      setSessionCookie(res, s.id);
      res.status(200).json({ user: toMe(row) });
    } catch (e) {
      next(e);
    }
  });

  r.post('/logout', (req, res, next) => {
    try {
      const sid = sidOf(req);
      if (sid) deleteSession(db, sid);
      clearSessionCookie(res);
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  });

  r.get('/me', (req, res) => {
    res.status(200).json({ user: req.user ? meFromSession(req.user) : null });
  });

  return r;
}
