import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../db';
import { createPost, findBySlug, listByAuthor, listPublished, nextUpdatedAt, toPost, toPostSummary, updatePost } from './repo';
import { listPublishedPostsByAuthor, parsePage } from './index';

function setup() {
  const db = openDb(':memory:');
  const ins = db.prepare("INSERT INTO users (username,email,display_name,password_hash,created_at) VALUES (?,?,?,?,?)");
  const a = Number(ins.run('alice', 'alice@x.com', 'Alice', 'SECRETHASH', '2026-01-01T00:00:00.000Z').lastInsertRowid);
  const b = Number(ins.run('bob', 'bob@x.com', 'Bob', 'SECRETHASH', '2026-01-01T00:00:00.000Z').lastInsertRowid);
  return { db, a, b };
}

describe('slugs', () => {
  it('appends -2, -3 on collisions', () => {
    const { db, a, b } = setup();
    const s = [1, 2, 3].map((i) => createPost(db, { authorId: i === 2 ? b : a, title: 'Hello World', body: '', status: 'draft' }).slug);
    assert.deepEqual(s, ['hello-world', 'hello-world-2', 'hello-world-3']);
  });
  it('retries with the next suffix when a race makes the pre-check miss', () => {
    const { db, a } = setup();
    createPost(db, { authorId: a, title: 'Race', body: '', status: 'draft' });
    let missed = false;
    const proxy = new Proxy(db, {
      get(t, p, r) {
        if (p === 'prepare') {
          return (sql: string) => {
            const st = t.prepare(sql);
            if (sql.startsWith('SELECT 1 FROM posts WHERE slug') && !missed) {
              missed = true;
              return { get: () => undefined };
            }
            return st;
          };
        }
        if (p === 'transaction') return (fn: any) => t.transaction(fn);
        const v = Reflect.get(t, p, t);
        return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    const row = createPost(proxy as typeof db, { authorId: a, title: 'Race', body: '', status: 'draft' });
    assert.equal(missed, true);
    assert.equal(row.slug, 'race-2');
  });
  it('slug is unchanged by title updates', () => {
    const { db, a } = setup();
    const p = createPost(db, { authorId: a, title: 'Old', body: '', status: 'draft' });
    const u = updatePost(db, p, { title: 'New Title' });
    assert.equal(u.slug, 'old');
    assert.equal(u.title, 'New Title');
  });
});

describe('pagination', () => {
  it('math and ordering', () => {
    const { db, a } = setup();
    assert.deepEqual(listPublished(db, { page: 1 }), { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    for (let i = 1; i <= 25; i++) createPost(db, { authorId: a, title: `P${i}`, body: '', status: 'published' });
    createPost(db, { authorId: a, title: 'draft', body: '', status: 'draft' });
    const p1 = listPublished(db, { page: 1 });
    assert.equal(p1.total, 25);
    assert.equal(p1.totalPages, 3);
    assert.equal(p1.items.length, 10);
    assert.equal(p1.items[0]!.title, 'P25');
    assert.equal(listPublished(db, { page: 3 }).items.length, 5);
    const beyond = listPublished(db, { page: 4 });
    assert.deepEqual([beyond.items.length, beyond.total, beyond.totalPages], [0, 25, 3]);
    assert.equal(listPublishedPostsByAuthor(db, a, 2).items.length, 10);
  });
  it('listByAuthor filters by status and excludes others', () => {
    const { db, a, b } = setup();
    createPost(db, { authorId: a, title: 'd', body: '', status: 'draft' });
    createPost(db, { authorId: a, title: 'p', body: '', status: 'published' });
    createPost(db, { authorId: b, title: 'other', body: '', status: 'published' });
    assert.equal(listByAuthor(db, a, { page: 1 }).total, 2);
    assert.deepEqual(listByAuthor(db, a, { status: 'draft', page: 1 }).items.map((i) => i.title), ['d']);
    assert.equal(listPublishedPostsByAuthor(db, b, 1).total, 1);
  });
  it('parsePage', () => {
    assert.equal(parsePage({}), 1);
    assert.equal(parsePage({ page: '3' }), 3);
    for (const bad of ['0', '-1', '1.5', 'abc', '', ['1', '2'], ' 1', 5, null]) {
      assert.throws(() => parsePage({ page: bad }), (e: any) => e.status === 400 && e.fields?.page === 'Must be an integer >= 1');
    }
  });
});

describe('status transitions', () => {
  const T0 = new Date('2026-05-01T00:00:00.000Z');
  const cases: Array<[string, 'draft' | 'published', 'draft' | 'published', 'null' | 'now' | 'keep']> = [
    ['draft->published sets now', 'draft', 'published', 'now'],
    ['published->draft nulls', 'published', 'draft', 'null'],
    ['published->published keeps', 'published', 'published', 'keep'],
    ['draft->draft stays null', 'draft', 'draft', 'null'],
  ];
  for (const [name, from, to, expect] of cases) {
    it(name, () => {
      const { db, a } = setup();
      const p = createPost(db, { authorId: a, title: 't', body: '', status: from });
      const later = new Date(Date.parse(p.created_at) + 5000);
      const u = updatePost(db, p, { status: to }, later);
      if (expect === 'now') assert.equal(u.published_at, later.toISOString());
      if (expect === 'null') assert.equal(u.published_at, null);
      if (expect === 'keep') assert.equal(u.published_at, p.published_at);
    });
  }
  it('updated_at always increases, +1ms on a tie or clock going backwards', () => {
    const prev = T0.toISOString();
    assert.equal(nextUpdatedAt(prev, T0), '2026-05-01T00:00:00.001Z');
    assert.equal(nextUpdatedAt(prev, new Date(T0.getTime() - 5000)), '2026-05-01T00:00:00.001Z');
    assert.equal(nextUpdatedAt(prev, new Date(T0.getTime() + 5)), '2026-05-01T00:00:00.005Z');
  });
  it('body change recomputes html; non-body change keeps it', () => {
    const { db, a } = setup();
    const p = createPost(db, { authorId: a, title: 't', body: '# one', status: 'draft' });
    assert.match(p.body_html, /<h1[^>]*>one/);
    const u1 = updatePost(db, p, { title: 'x' });
    assert.equal(u1.body_html, p.body_html);
    const u2 = updatePost(db, u1, { body: '**two**' });
    assert.match(u2.body_html, /<strong>two/);
  });
});

describe('serializers', () => {
  it('leak no author id, email or password hash', () => {
    const { db, a } = setup();
    const row = createPost(db, { authorId: a, title: 'T', body: 'hi there', status: 'published' });
    const found = findBySlug(db, 't')!;
    for (const o of [toPostSummary(found), toPost(found), row && toPost(row)]) {
      const json = JSON.stringify(o);
      assert.ok(!/SECRETHASH|alice@x\.com|author_id|authorId|password/i.test(json), json);
      assert.deepEqual(Object.keys((o as any).author).sort(), ['displayName', 'username']);
    }
    assert.deepEqual(Object.keys(toPostSummary(found)).sort(), ['author', 'createdAt', 'excerpt', 'id', 'publishedAt', 'slug', 'status', 'title', 'updatedAt']);
    assert.deepEqual(Object.keys(toPost(found)).sort(), ['author', 'body', 'createdAt', 'excerpt', 'html', 'id', 'publishedAt', 'slug', 'status', 'title', 'updatedAt']);
  });
});
