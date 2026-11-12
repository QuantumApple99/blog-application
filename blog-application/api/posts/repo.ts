import type { Database } from 'better-sqlite3';
import { excerpt, renderMarkdown, slugify } from '../markdown';

export const PAGE_SIZE = 10 as const;
export type Status = 'draft' | 'published';

export type PostSummary = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  status: Status;
  author: { username: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};
export type Post = PostSummary & { body: string; html: string };
export type Page<T> = { items: T[]; page: number; pageSize: 10; total: number; totalPages: number };

/** Internal row (joined with the author). authorId never leaves the repo/routes. */
export type PostRow = {
  id: number;
  author_id: number;
  slug: string;
  title: string;
  body: string;
  body_html: string;
  status: Status;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  username: string;
  display_name: string;
};

const SELECT = `SELECT p.id, p.author_id, p.slug, p.title, p.body, p.body_html, p.status, p.created_at,
  p.updated_at, p.published_at, u.username, u.display_name
  FROM posts p JOIN users u ON u.id = p.author_id`;

export function toPostSummary(r: PostRow): PostSummary {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    excerpt: excerpt(r.body),
    status: r.status,
    author: { username: r.username, displayName: r.display_name },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    publishedAt: r.published_at ?? null,
  };
}

export function toPost(r: PostRow): Post {
  return { ...toPostSummary(r), body: r.body, html: r.body_html };
}

function pageOf<T>(items: T[], page: number, total: number): Page<T> {
  return { items, page, pageSize: PAGE_SIZE, total, totalPages: Math.ceil(total / PAGE_SIZE) };
}

function isUniqueError(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT');
}

const MAX_SLUG_ATTEMPTS = 1000;

export function createPost(
  db: Database,
  input: { authorId: number; title: string; body: string; status: Status },
): PostRow {
  const now = new Date().toISOString();
  const base = slugify(input.title);
  const html = renderMarkdown(input.body);
  const publishedAt = input.status === 'published' ? now : null;
  const exists = db.prepare('SELECT 1 FROM posts WHERE slug = ?');
  const insert = db.prepare(
    `INSERT INTO posts (author_id, slug, title, body, body_html, status, created_at, updated_at, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const attempt = db.transaction((slug: string): number | null => {
    if (exists.get(slug)) return null;
    return Number(insert.run(input.authorId, slug, input.title, input.body, html, input.status, now, now, publishedAt).lastInsertRowid);
  });
  for (let n = 1; n <= MAX_SLUG_ATTEMPTS; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    try {
      const id = attempt(slug);
      if (id !== null) return getById(db, id) as PostRow;
    } catch (e) {
      if (!isUniqueError(e)) throw e; // UNIQUE(slug) race: fall through to the next suffix
    }
  }
  throw new Error('Could not allocate a unique slug');
}

function getById(db: Database, id: number): PostRow | undefined {
  return db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as PostRow | undefined;
}

export function findBySlug(db: Database, slug: string): PostRow | undefined {
  return db.prepare(`${SELECT} WHERE p.slug = ?`).get(slug) as PostRow | undefined;
}

/** Computes the next updated_at: now, or previous + 1ms if the clock did not advance. */
export function nextUpdatedAt(previous: string, now: Date = new Date()): string {
  const prev = new Date(previous).getTime();
  const cur = now.getTime();
  return new Date(cur > prev ? cur : prev + 1).toISOString();
}

export function updatePost(
  db: Database,
  current: PostRow,
  changes: { title?: string; body?: string; status?: Status },
  now: Date = new Date(),
): PostRow {
  const title = changes.title ?? current.title;
  const body = changes.body ?? current.body;
  const html = changes.body !== undefined ? renderMarkdown(body) : current.body_html;
  const status = changes.status ?? current.status;
  let publishedAt = current.published_at;
  if (current.status === 'draft' && status === 'published') publishedAt = now.toISOString();
  else if (current.status === 'published' && status === 'draft') publishedAt = null;
  const updatedAt = nextUpdatedAt(current.updated_at, now);
  db.prepare(
    'UPDATE posts SET title = ?, body = ?, body_html = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ?',
  ).run(title, body, html, status, publishedAt, updatedAt, current.id);
  return getById(db, current.id) as PostRow;
}

export function deletePost(db: Database, id: number): void {
  db.prepare('DELETE FROM posts WHERE id = ?').run(id);
}

function offset(page: number): number {
  return (page - 1) * PAGE_SIZE;
}

export function listPublished(db: Database, opts: { authorId?: number; page: number }): Page<PostSummary> {
  const byAuthor = opts.authorId !== undefined;
  const where = byAuthor ? "p.status = 'published' AND p.author_id = ?" : "p.status = 'published'";
  const args: number[] = byAuthor ? [opts.authorId as number] : [];
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`).get(...args) as { n: number }).n;
  const rows = db
    .prepare(`${SELECT} WHERE ${where} ORDER BY p.published_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, PAGE_SIZE, offset(opts.page)) as PostRow[];
  return pageOf(rows.map(toPostSummary), opts.page, total);
}

export function listByAuthor(
  db: Database,
  authorId: number,
  opts: { status?: Status; page: number },
): Page<PostSummary> {
  const withStatus = opts.status !== undefined;
  const where = withStatus ? 'p.author_id = ? AND p.status = ?' : 'p.author_id = ?';
  const args: Array<number | string> = withStatus ? [authorId, opts.status as string] : [authorId];
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM posts p WHERE ${where}`).get(...args) as { n: number }).n;
  const rows = db
    .prepare(`${SELECT} WHERE ${where} ORDER BY p.updated_at DESC, p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, PAGE_SIZE, offset(opts.page)) as PostRow[];
  return pageOf(rows.map(toPostSummary), opts.page, total);
}
