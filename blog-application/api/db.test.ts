import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db';

const NOW = '2026-01-01T00:00:00.000Z';
const addUser = (db: ReturnType<typeof openDb>, n = 'a') =>
  Number(
    db
      .prepare(
        `INSERT INTO users(username,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)`,
      )
      .run(n, `${n}@x.io`, n, 'h', NOW).lastInsertRowid,
  );
const addPost = (db: ReturnType<typeof openDb>, uid: number, slug: string, status = 'draft') =>
  db
    .prepare(
      `INSERT INTO posts(author_id,slug,title,body,body_html,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(uid, slug, 't', 'b', '<p>b</p>', status, NOW, NOW);

test('tables and indexes exist', () => {
  const db = openDb(':memory:');
  const names = (type: string) =>
    (db.prepare(`SELECT name FROM sqlite_master WHERE type=?`).all(type) as { name: string }[]).map(
      (r) => r.name,
    );
  const tables = names('table');
  for (const t of ['users', 'sessions', 'posts']) assert.ok(tables.includes(t), t);
  const idx = names('index');
  for (const i of ['idx_sessions_expires_at', 'idx_posts_status_published_at', 'idx_posts_author_id'])
    assert.ok(idx.includes(i), i);
});

test('wal, foreign_keys, user_version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-'));
  try {
    const db = openDb(join(dir, 'x.db'));
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.equal(db.pragma('user_version', { simple: true }), 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reopen is idempotent and data survives', () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-'));
  try {
    const p = join(dir, 'x.db');
    const db = openDb(p);
    addUser(db);
    db.close();
    const db2 = openDb(p);
    assert.equal((db2.prepare('SELECT COUNT(*) c FROM users').get() as { c: number }).c, 1);
    assert.equal(db2.pragma('user_version', { simple: true }), 1);
    db2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('nested parent dirs are auto-created', () => {
  const dir = mkdtempSync(join(tmpdir(), 'db-'));
  try {
    const db = openDb(join(dir, 'a', 'b', 'c', 'x.db'));
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('posts status CHECK rejects a bad status', () => {
  const db = openDb(':memory:');
  const uid = addUser(db);
  assert.throws(() => addPost(db, uid, 's', 'archived'), /CHECK/);
  addPost(db, uid, 's', 'published');
});

test('deleting a user cascades to posts and sessions', () => {
  const db = openDb(':memory:');
  const uid = addUser(db);
  addPost(db, uid, 's1');
  db.prepare(`INSERT INTO sessions(id,user_id,created_at,expires_at) VALUES ('sid',?,?,?)`).run(
    uid,
    NOW,
    NOW,
  );
  db.prepare('DELETE FROM users WHERE id=?').run(uid);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM posts').get() as { c: number }).c, 0);
  assert.equal((db.prepare('SELECT COUNT(*) c FROM sessions').get() as { c: number }).c, 0);
});
