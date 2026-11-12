import crypto from 'node:crypto';
import type { Database } from 'better-sqlite3';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  createdAt: string;
}

export function createSession(db: Database, userId: number): { id: string; expiresAt: string } {
  const id = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    id,
    userId,
    createdAt,
    expiresAt,
  );
  return { id, expiresAt };
}

export function getSessionUser(db: Database, sid: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.display_name, u.bio, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(sid) as
    | {
        id: number;
        username: string;
        email: string;
        display_name: string;
        bio: string;
        created_at: string;
        expires_at: string;
      }
    | undefined;
  if (!row) return null;
  const exp = Date.parse(row.expires_at);
  if (!(exp > Date.now())) {
    deleteSession(db, sid);
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    bio: row.bio,
    createdAt: row.created_at,
  };
}

export function deleteSession(db: Database, sid: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
}

export function purgeExpired(db: Database): number {
  return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString()).changes;
}
