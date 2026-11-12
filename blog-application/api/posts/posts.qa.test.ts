process.env['BCRYPT_ROUNDS'] = '4';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createApi } from '../index';
import { openDb } from '../db';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SUMMARY_KEYS = ['author', 'createdAt', 'excerpt', 'id', 'publishedAt', 'slug', 'status', 'title', 'updatedAt'];
const POST_KEYS = [...SUMMARY_KEYS, 'body', 'html'].sort();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newApp() {
  return express().use('/api', createApi({ db: openDb(':memory:') }));
}
type App = ReturnType<typeof newApp>;
type Agent = ReturnType<typeof request.agent>;

let counter = 0;
async function user(app: App, name?: string): Promise<Agent> {
  const n = name ?? `user${++counter}x${Date.now() % 100000}`;
  const a = request.agent(app);
  const res = await a
    .post('/api/auth/signup')
    .send({ username: n, email: `${n}@example.com`, displayName: `Name ${n}`, password: 'password123' });
  assert.equal(res.status, 201, `signup failed: ${JSON.stringify(res.body)}`);
  (a as any).__username = n;
  return a;
}
const uname = (a: Agent): string => (a as any).__username;

async function mk(a: Agent, title: string, body = 'hello', status: string = 'published') {
  const res = await a.post('/api/posts').send({ title, body, status });
  assert.equal(res.status, 201, `create failed: ${JSON.stringify(res.body)}`);
  return res.body.post;
}

function assertErr(res: any, status: number, code: string) {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
}

describe('AC-01 CRUD', () => {
  it('AC-01 create, read, list, patch, delete', async () => {
    const app = newApp();
    const a = await user(app);
    const c = await a.post('/api/posts').send({ title: 'Hello', body: '# hi', status: 'published' });
    assert.equal(c.status, 201);
    assert.ok(c.body.post);
    const slug = c.body.post.slug;
    const g = await request(app).get(`/api/posts/${slug}`);
    assert.equal(g.status, 200);
    assert.equal(g.body.post.title, 'Hello');
    const l = await request(app).get('/api/posts');
    assert.equal(l.status, 200);
    assert.equal(l.body.items.length, 1);
    const p = await a.patch(`/api/posts/${slug}`).send({ title: 'Changed', body: 'new' });
    assert.equal(p.status, 200);
    assert.equal(p.body.post.title, 'Changed');
    assert.equal(p.body.post.body, 'new');
    const d = await a.delete(`/api/posts/${slug}`);
    assert.equal(d.status, 204);
    const g2 = await request(app).get(`/api/posts/${slug}`);
    assertErr(g2, 404, 'NOT_FOUND');
    const d2 = await a.delete(`/api/posts/${slug}`);
    assertErr(d2, 404, 'NOT_FOUND');
  });
});

describe('AC-02 exact shapes', () => {
  it('AC-02 Post, PostSummary and Page shapes', async () => {
    const app = newApp();
    const a = await user(app);
    const created = await mk(a, 'Shapes', 'body **x**');
    assert.deepEqual(Object.keys(created).sort(), POST_KEYS);
    assert.ok(Number.isInteger(created.id));
    for (const k of ['createdAt', 'updatedAt', 'publishedAt']) assert.match(created[k], ISO, k);
    const g = await request(app).get(`/api/posts/${created.slug}`);
    assert.deepEqual(Object.keys(g.body.post).sort(), POST_KEYS);
    assert.deepEqual(Object.keys(g.body).sort(), ['post']);
    const l = await request(app).get('/api/posts');
    assert.deepEqual(Object.keys(l.body).sort(), ['items', 'page', 'pageSize', 'total', 'totalPages']);
    assert.equal(l.body.pageSize, 10);
    assert.equal(l.body.page, 1);
    assert.deepEqual(Object.keys(l.body.items[0]).sort(), SUMMARY_KEYS);
    assert.ok(Number.isInteger(l.body.items[0].id));
    for (const k of ['createdAt', 'updatedAt', 'publishedAt']) assert.match(l.body.items[0][k], ISO, k);
    const m = await a.get('/api/me/posts');
    assert.deepEqual(Object.keys(m.body).sort(), ['items', 'page', 'pageSize', 'total', 'totalPages']);
    assert.deepEqual(Object.keys(m.body.items[0]).sort(), SUMMARY_KEYS);
    const u = await request(app).get(`/api/users/${uname(a)}/posts`);
    assert.deepEqual(Object.keys(u.body).sort(), ['items', 'page', 'pageSize', 'total', 'totalPages']);
    assert.deepEqual(Object.keys(u.body.items[0]).sort(), SUMMARY_KEYS);
  });
  it('AC-02 draft has null publishedAt and excerpt is plain text', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Draft', '# Title\n\nSome **bold** text', 'draft');
    assert.equal(p.publishedAt, null);
    assert.equal(typeof p.excerpt, 'string');
    assert.ok(!/[*#]/.test(p.excerpt), `excerpt not stripped: ${p.excerpt}`);
    assert.ok(p.excerpt.length <= 200);
  });
  it('AC-02 excerpt has no HTML tags or entity text', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Entities', 'Tom & Jerry <b>bold</b> "quoted" <i>it</i> > 1\n\n> quote & more');
    assert.ok(!/<[^>]+>/.test(p.excerpt), `tags in excerpt: ${p.excerpt}`);
    assert.ok(!/&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(p.excerpt), `entities in excerpt: ${p.excerpt}`);
  });
  it('AC-02 excerpt is at most 200 chars', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Long', 'word '.repeat(200));
    assert.ok(p.excerpt.length <= 200, `len ${p.excerpt.length}`);
  });
});

describe('AC-03 unauthenticated', () => {
  it('AC-03 returns 401 UNAUTHENTICATED with error body', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Mine');
    const cases = [
      request(app).post('/api/posts').send({ title: 't', body: 'b', status: 'draft' }),
      request(app).patch(`/api/posts/${p.slug}`).send({ title: 'x' }),
      request(app).delete(`/api/posts/${p.slug}`),
      request(app).get('/api/me/posts'),
    ];
    for (const r of cases) {
      const res = await r;
      assertErr(res, 401, 'UNAUTHENTICATED');
      assert.deepEqual(Object.keys(res.body), ['error']);
    }
  });
});

describe('AC-04 authorization and not found', () => {
  it('AC-04 other user gets 403 on PATCH and DELETE', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const p = await mk(a, 'Owned');
    assertErr(await b.patch(`/api/posts/${p.slug}`).send({ title: 'hax' }), 403, 'FORBIDDEN');
    assertErr(await b.delete(`/api/posts/${p.slug}`), 403, 'FORBIDDEN');
    const g = await request(app).get(`/api/posts/${p.slug}`);
    assert.equal(g.body.post.title, 'Owned');
  });
  it('AC-04 missing slug is 404 on GET, PATCH, DELETE', async () => {
    const app = newApp();
    const a = await user(app);
    assertErr(await request(app).get('/api/posts/nope'), 404, 'NOT_FOUND');
    assertErr(await a.patch('/api/posts/nope').send({ title: 'x' }), 404, 'NOT_FOUND');
    assertErr(await a.delete('/api/posts/nope'), 404, 'NOT_FOUND');
  });
  it('AC-04 anonymous mutations return 401 before 404/403', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Exists');
    assertErr(await request(app).patch('/api/posts/nope').send({ title: 'x' }), 401, 'UNAUTHENTICATED');
    assertErr(await request(app).delete('/api/posts/nope'), 401, 'UNAUTHENTICATED');
    assertErr(await request(app).patch(`/api/posts/${p.slug}`).send({ title: 'x' }), 401, 'UNAUTHENTICATED');
  });
});

describe('AC-05 drafts', () => {
  it('AC-05 draft is visible only to its author by slug', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const d = await mk(a, 'Secret', 'x', 'draft');
    assertErr(await request(app).get(`/api/posts/${d.slug}`), 404, 'NOT_FOUND');
    assertErr(await b.get(`/api/posts/${d.slug}`), 404, 'NOT_FOUND');
    const own = await a.get(`/api/posts/${d.slug}`);
    assert.equal(own.status, 200);
    assert.equal(own.body.post.status, 'draft');
  });
  it('AC-05 drafts absent from public lists, present in /me/posts', async () => {
    const app = newApp();
    const a = await user(app);
    const pub = await mk(a, 'Public');
    const d = await mk(a, 'Hidden', 'x', 'draft');
    const feed = await request(app).get('/api/posts');
    assert.deepEqual(feed.body.items.map((i: any) => i.slug), [pub.slug]);
    assert.equal(feed.body.total, 1);
    const prof = await request(app).get(`/api/users/${uname(a)}/posts`);
    assert.deepEqual(prof.body.items.map((i: any) => i.slug), [pub.slug]);
    assert.equal(prof.body.total, 1);
    const me = await a.get('/api/me/posts');
    assert.deepEqual(me.body.items.map((i: any) => i.slug).sort(), [pub.slug, d.slug].sort());
    // even the author's own session must not see drafts on public lists
    const feedAsAuthor = await a.get('/api/posts');
    assert.equal(feedAsAuthor.body.total, 1);
    const profAsAuthor = await a.get(`/api/users/${uname(a)}/posts`);
    assert.equal(profAsAuthor.body.total, 1);
  });
});

describe('AC-06 pagination', () => {
  async function seed25(app: App, a: Agent) {
    const slugs: string[] = [];
    for (let i = 1; i <= 25; i++) slugs.push((await mk(a, `Post number ${i}`)).slug);
    return slugs.reverse(); // newest first
  }
  async function checkPaging(app: App, path: string, expected: string[], agent: Agent | null) {
    const get = (q: string) => (agent ?? request(app)).get(`${path}${q}`);
    const p1 = await get('?page=1');
    const p2 = await get('?page=2');
    const p3 = await get('?page=3');
    const p4 = await get('?page=4');
    assert.deepEqual([p1, p2, p3].map((r) => r.body.items.length), [10, 10, 5]);
    assert.equal(p4.status, 200);
    assert.deepEqual(p4.body.items, []);
    for (const [i, r] of [p1, p2, p3, p4].entries()) {
      assert.equal(r.body.page, i + 1);
      assert.equal(r.body.total, 25);
      assert.equal(r.body.totalPages, 3);
      assert.equal(r.body.pageSize, 10);
    }
    const all = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((i: any) => i.slug);
    assert.deepEqual(all, expected);
    const def = await get('');
    assert.equal(def.status, 200);
    assert.equal(def.body.page, 1);
    assert.equal(def.body.items.length, 10);
    for (const bad of ['0', 'abc', '-1']) {
      assertErr(await get(`?page=${bad}`), 400, 'VALIDATION');
    }
  }
  it('AC-06 /api/posts pages, totals, order, invalid page', async () => {
    const app = newApp();
    const a = await user(app);
    const slugs = await seed25(app, a);
    await checkPaging(app, '/api/posts', slugs, null);
    const feed = await request(app).get('/api/posts?page=1');
    const times = feed.body.items.map((i: any) => i.publishedAt);
    assert.deepEqual(times, [...times].sort().reverse());
  });
  it('AC-06 /api/me/posts pages and invalid page', async () => {
    const app = newApp();
    const a = await user(app);
    const slugs = await seed25(app, a);
    // updatedAt DESC: untouched posts are in reverse creation order too
    await checkPaging(app, '/api/me/posts', slugs, a);
  });
  it('AC-06 /api/users/:u/posts pages and invalid page', async () => {
    const app = newApp();
    const a = await user(app);
    const slugs = await seed25(app, a);
    await checkPaging(app, `/api/users/${uname(a)}/posts`, slugs, null);
  });
  it('AC-06 unknown user on /users/:u/posts is 404', async () => {
    const app = newApp();
    assertErr(await request(app).get('/api/users/ghostuser/posts'), 404, 'NOT_FOUND');
  });
});

describe('AC-07 /me/posts', () => {
  it('AC-07 all statuses ordered by updatedAt DESC', async () => {
    const app = newApp();
    const a = await user(app);
    const p1 = await mk(a, 'First', 'x', 'published');
    await sleep(15);
    const p2 = await mk(a, 'Second', 'x', 'draft');
    await sleep(15);
    const p3 = await mk(a, 'Third', 'x', 'published');
    let res = await a.get('/api/me/posts');
    assert.deepEqual(res.body.items.map((i: any) => i.slug), [p3.slug, p2.slug, p1.slug]);
    await sleep(15);
    await a.patch(`/api/posts/${p1.slug}`).send({ body: 'edited' });
    res = await a.get('/api/me/posts');
    assert.deepEqual(res.body.items.map((i: any) => i.slug), [p1.slug, p3.slug, p2.slug]);
  });
  it('AC-07 status filter', async () => {
    const app = newApp();
    const a = await user(app);
    const pub = await mk(a, 'Pub', 'x', 'published');
    const dr = await mk(a, 'Dr', 'x', 'draft');
    const d = await a.get('/api/me/posts?status=draft');
    assert.deepEqual(d.body.items.map((i: any) => i.slug), [dr.slug]);
    assert.equal(d.body.total, 1);
    const p = await a.get('/api/me/posts?status=published');
    assert.deepEqual(p.body.items.map((i: any) => i.slug), [pub.slug]);
    assert.equal(p.body.total, 1);
    assertErr(await a.get('/api/me/posts?status=bogus'), 400, 'VALIDATION');
  });
  it('AC-07 only own posts', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const pa = await mk(a, 'A post');
    const pb = await mk(b, 'B post', 'x', 'draft');
    const ra = await a.get('/api/me/posts');
    assert.deepEqual(ra.body.items.map((i: any) => i.slug), [pa.slug]);
    const rb = await b.get('/api/me/posts');
    assert.deepEqual(rb.body.items.map((i: any) => i.slug), [pb.slug]);
  });
});

describe('AC-08 slugs', () => {
  it('AC-08 duplicate titles get -2 and stay stable on edit', async () => {
    const app = newApp();
    const a = await user(app);
    const p1 = await mk(a, 'x');
    const p2 = await mk(a, 'x');
    assert.equal(p1.slug, 'x');
    assert.equal(p2.slug, 'x-2');
    const e = await a.patch(`/api/posts/${p2.slug}`).send({ title: 'Totally different' });
    assert.equal(e.body.post.slug, 'x-2');
    const g = await request(app).get('/api/posts/x-2');
    assert.equal(g.status, 200);
    assert.equal(g.body.post.title, 'Totally different');
  });
  it('AC-08 slugs unique across users', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const p1 = await mk(a, 'Same title');
    const p2 = await mk(b, 'Same title');
    assert.equal(p1.slug, 'same-title');
    assert.equal(p2.slug, 'same-title-2');
    const p3 = await mk(a, 'Same title');
    assert.equal(p3.slug, 'same-title-3');
  });
  it('AC-08 symbols-only title becomes "post"', async () => {
    const app = newApp();
    const a = await user(app);
    assert.equal((await mk(a, '!!!')).slug, 'post');
    assert.equal((await mk(a, '???')).slug, 'post-2');
  });
  it('AC-08 diacritics are stripped', async () => {
    const app = newApp();
    const a = await user(app);
    assert.equal((await mk(a, 'Café Ünïcode')).slug, 'cafe-unicode');
  });
  it('AC-08 long title slug is at most 60 chars with no trailing dash', async () => {
    const app = newApp();
    const a = await user(app);
    const plain = await mk(a, 'word '.repeat(40).trim());
    assert.ok(plain.slug.length <= 60, plain.slug);
    assert.ok(!plain.slug.endsWith('-'), plain.slug);
    const edge = await mk(a, 'a'.repeat(59) + ' ' + 'b'.repeat(20));
    assert.ok(edge.slug.length <= 60, edge.slug);
    assert.ok(!edge.slug.endsWith('-'), edge.slug);
    assert.match(edge.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it('AC-08 slug is lowercase [a-z0-9-] only', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, '  Hello,   World_2026!  ');
    assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(p.slug, 'hello-world-2026');
  });
});

describe('AC-09 sanitization', () => {
  const bad = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '[x](javascript:alert(1))',
    '<iframe src="https://evil.example"></iframe>',
    '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
    '<style>body{display:none}</style>',
    '<SCRIPT>alert(1)</SCRIPT>',
    '<IMG SRC=x ONERROR=alert(1)>',
    '[x](JaVaScRiPt:alert(1))',
  ];
  const forbidden = ['<script', 'onerror', 'javascript:', '<iframe', 'data:', '<style'];
  it('AC-09 dangerous input never reaches html, body stays raw', async () => {
    const app = newApp();
    const a = await user(app);
    for (const input of bad) {
      const p = await mk(a, 'Sanitize', input);
      assert.equal(p.body, input);
      const lower = p.html.toLowerCase();
      for (const f of forbidden) assert.ok(!lower.includes(f), `html contains ${f} for ${input}: ${p.html}`);
      const g = await request(app).get(`/api/posts/${p.slug}`);
      assert.equal(g.body.post.body, input);
      for (const f of forbidden) assert.ok(!g.body.post.html.toLowerCase().includes(f), `GET html contains ${f}`);
    }
  });
  it('AC-09 sanitizes on PATCH too', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Patch me', 'safe');
    const r = await a.patch(`/api/posts/${p.slug}`).send({ body: bad[1] });
    assert.equal(r.body.post.body, bad[1]);
    assert.ok(!r.body.post.html.toLowerCase().includes('onerror'));
  });
  it('AC-09 safe markdown still renders', async () => {
    const app = newApp();
    const a = await user(app);
    const md = [
      '# Heading',
      '',
      'Some **strong** text and a [link](https://example.com).',
      '',
      '- one',
      '- two',
      '',
      '```',
      'code block',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '![alt text](https://example.com/pic.png)',
    ].join('\n');
    const p = await mk(a, 'Render', md);
    const h: string = p.html;
    assert.match(h, /<h1[^>]*>Heading<\/h1>/);
    assert.match(h, /<strong>strong<\/strong>/);
    assert.match(h, /<li>/);
    assert.match(h, /<pre>/);
    assert.match(h, /<code/);
    assert.match(h, /<table/);
    assert.match(h, /<td>1<\/td>/);
    const anchor = h.match(/<a [^>]*href="https:\/\/example\.com\/?"[^>]*>/);
    assert.ok(anchor, `link missing: ${h}`);
    const rel = anchor![0].match(/rel="([^"]*)"/);
    assert.ok(rel, `rel missing: ${anchor![0]}`);
    assert.ok(rel![1].includes('noopener') && rel![1].includes('nofollow'), rel![1]);
    assert.match(h, /<img [^>]*src="https:\/\/example\.com\/pic\.png"/);
  });
});

describe('AC-10 publishedAt and updatedAt', () => {
  it('AC-10 publishedAt set at create, null for draft', async () => {
    const app = newApp();
    const a = await user(app);
    const pub = await mk(a, 'P', 'x', 'published');
    const dr = await mk(a, 'D', 'x', 'draft');
    assert.match(pub.publishedAt, ISO);
    assert.equal(dr.publishedAt, null);
  });
  it('AC-10 status transitions', async () => {
    const app = newApp();
    const a = await user(app);
    const d = await mk(a, 'Trans', 'x', 'draft');
    await sleep(15);
    const toPub = await a.patch(`/api/posts/${d.slug}`).send({ status: 'published' });
    assert.equal(toPub.status, 200);
    const t1 = toPub.body.post.publishedAt;
    assert.match(t1, ISO);
    await sleep(15);
    const stay = await a.patch(`/api/posts/${d.slug}`).send({ title: 'Trans 2', status: 'published' });
    assert.equal(stay.body.post.publishedAt, t1, 'published->published must keep publishedAt');
    const stay2 = await a.patch(`/api/posts/${d.slug}`).send({ body: 'other' });
    assert.equal(stay2.body.post.publishedAt, t1);
    await sleep(15);
    const toDraft = await a.patch(`/api/posts/${d.slug}`).send({ status: 'draft' });
    assert.equal(toDraft.body.post.publishedAt, null);
    const own = await a.get(`/api/posts/${d.slug}`);
    assert.equal(own.body.post.publishedAt, null);
    await sleep(15);
    const again = await a.patch(`/api/posts/${d.slug}`).send({ status: 'published' });
    assert.match(again.body.post.publishedAt, ISO);
    assert.ok(again.body.post.publishedAt > t1, 're-publish should set a fresh publishedAt');
  });
  it('AC-10 updatedAt changes on PATCH, createdAt and slug never do, html follows body', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Stable', 'first body');
    await sleep(15);
    const r1 = await a.patch(`/api/posts/${p.slug}`).send({ title: 'Stable renamed' });
    assert.ok(r1.body.post.updatedAt > p.updatedAt);
    assert.equal(r1.body.post.createdAt, p.createdAt);
    assert.equal(r1.body.post.slug, p.slug);
    assert.equal(r1.body.post.html, p.html);
    await sleep(15);
    const r2 = await a.patch(`/api/posts/${p.slug}`).send({ body: '# totally new' });
    assert.ok(r2.body.post.updatedAt > r1.body.post.updatedAt);
    assert.equal(r2.body.post.createdAt, p.createdAt);
    assert.notEqual(r2.body.post.html, p.html);
    assert.match(r2.body.post.html, /<h1/);
    assert.equal(r2.body.post.slug, p.slug);
  });
  it('AC-10 patching only the title keeps body', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Partial', 'keep me');
    const r = await a.patch(`/api/posts/${p.slug}`).send({ title: 'Partial 2' });
    assert.equal(r.body.post.body, 'keep me');
    assert.equal(r.body.post.status, 'published');
  });
});

describe('AC-11 validation', () => {
  const create = (a: Agent, payload: any) => a.post('/api/posts').send(payload);
  function assertField(res: any, field: string) {
    assertErr(res, 400, 'VALIDATION');
    assert.ok(res.body.error.fields && field in res.body.error.fields, `fields should name ${field}: ${JSON.stringify(res.body)}`);
  }
  it('AC-11 empty and whitespace title', async () => {
    const app = newApp();
    const a = await user(app);
    assertField(await create(a, { title: '', body: 'b', status: 'draft' }), 'title');
    assertField(await create(a, { title: '   \t ', body: 'b', status: 'draft' }), 'title');
    assertField(await create(a, { body: 'b', status: 'draft' }), 'title');
  });
  it('AC-11 title length boundary 200 ok, 201 rejected', async () => {
    const app = newApp();
    const a = await user(app);
    const ok = await create(a, { title: 'a'.repeat(200), body: 'b', status: 'draft' });
    assert.equal(ok.status, 201);
    assertField(await create(a, { title: 'a'.repeat(201), body: 'b', status: 'draft' }), 'title');
  });
  it('AC-11 body length boundary 100000 ok, 100001 rejected', async () => {
    const app = newApp();
    const a = await user(app);
    const ok = await create(a, { title: 'Big', body: 'a'.repeat(100000), status: 'draft' });
    assert.equal(ok.status, 201, `100000 chars rejected: ${JSON.stringify(ok.body).slice(0, 200)}`);
    assert.equal(ok.body.post.body.length, 100000);
    const over = await create(a, { title: 'Big2', body: 'a'.repeat(100001), status: 'draft' });
    // Ambiguity if the 100kb transport limit trips first: it would still be 400 VALIDATION, but fields may lack "body".
    assertErr(over, 400, 'VALIDATION');
    assert.ok(over.body.error.fields && 'body' in over.body.error.fields, `AMBIGUITY? no fields.body: ${JSON.stringify(over.body)}`);
  });
  it('AC-11 status missing or invalid', async () => {
    const app = newApp();
    const a = await user(app);
    assertField(await create(a, { title: 't', body: 'b' }), 'status');
    assertField(await create(a, { title: 't', body: 'b', status: 'archived' }), 'status');
    assertField(await create(a, { title: 't', body: 'b', status: 5 }), 'status');
  });
  it('AC-11 non-string title', async () => {
    const app = newApp();
    const a = await user(app);
    assertField(await create(a, { title: 123, body: 'b', status: 'draft' }), 'title');
    assertField(await create(a, { title: ['x'], body: 'b', status: 'draft' }), 'title');
    assertField(await create(a, { title: null, body: 'b', status: 'draft' }), 'title');
  });
  it('AC-11 non-string body is rejected', async () => {
    const app = newApp();
    const a = await user(app);
    assertField(await create(a, { title: 't', body: 42, status: 'draft' }), 'body');
  });
  it('AC-11 PATCH {} and invalid status', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, 'Patchy');
    assertErr(await a.patch(`/api/posts/${p.slug}`).send({}), 400, 'VALIDATION');
    assertField(await a.patch(`/api/posts/${p.slug}`).send({ status: 'archived' }), 'status');
    assertField(await a.patch(`/api/posts/${p.slug}`).send({ title: '  ' }), 'title');
    assertField(await a.patch(`/api/posts/${p.slug}`).send({ title: 'a'.repeat(201) }), 'title');
  });
  it('AC-11 titles are trimmed', async () => {
    const app = newApp();
    const a = await user(app);
    const p = await mk(a, '   Padded title  ');
    assert.equal(p.title, 'Padded title');
    const r = await a.patch(`/api/posts/${p.slug}`).send({ title: '  Padded 2 ' });
    assert.equal(r.body.post.title, 'Padded 2');
  });
  it('AC-11 empty body is allowed (0-100000)', async () => {
    const app = newApp();
    const a = await user(app);
    const r = await create(a, { title: 'No body', body: '', status: 'draft' });
    assert.equal(r.status, 201);
    assert.equal(r.body.post.body, '');
  });
});

describe('AC-12 Cache-Control no-store', () => {
  const NS = (res: any) => assert.equal(res.headers['cache-control'], 'no-store', `${res.status} ${res.req?.path}`);
  it('AC-12 on 200, 201, 204, 400, 401, 403, 404 and /api/nope', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const c = await a.post('/api/posts').send({ title: 'Cache', body: 'b', status: 'published' });
    assert.equal(c.status, 201);
    NS(c);
    const slug = c.body.post.slug;
    const r200 = await request(app).get('/api/posts');
    assert.equal(r200.status, 200);
    NS(r200);
    NS(await request(app).get(`/api/posts/${slug}`));
    NS(await a.get('/api/me/posts'));
    const patch = await a.patch(`/api/posts/${slug}`).send({ title: 'Cache 2' });
    assert.equal(patch.status, 200);
    NS(patch);
    const r400 = await a.post('/api/posts').send({ title: '', body: 'b', status: 'draft' });
    assert.equal(r400.status, 400);
    NS(r400);
    const r401 = await request(app).post('/api/posts').send({ title: 't', body: 'b', status: 'draft' });
    assert.equal(r401.status, 401);
    NS(r401);
    const r403 = await b.delete(`/api/posts/${slug}`);
    assert.equal(r403.status, 403);
    NS(r403);
    const r404 = await request(app).get('/api/posts/missing');
    assert.equal(r404.status, 404);
    NS(r404);
    const nope = await request(app).get('/api/nope');
    assert.equal(nope.status, 404);
    NS(nope);
    const r204 = await a.delete(`/api/posts/${slug}`);
    assert.equal(r204.status, 204);
    NS(r204);
    NS(await request(app).get('/api/health'));
  });
});

describe('AC-13 not found and health', () => {
  it('AC-13 unknown route is JSON 404 NOT_FOUND', async () => {
    const app = newApp();
    for (const m of ['get', 'post', 'delete'] as const) {
      const res = await request(app)[m]('/api/nope');
      assertErr(res, 404, 'NOT_FOUND');
      assert.match(res.headers['content-type'] ?? '', /json/);
    }
    assertErr(await request(app).get('/api/posts/a/b/c'), 404, 'NOT_FOUND');
  });
  it('AC-13 health returns {ok:true}', async () => {
    const app = newApp();
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});

describe('AC-14 request body handling', () => {
  it('AC-14 form-urlencoded and text/plain on POST /api/posts are 400 VALIDATION', async () => {
    const app = newApp();
    const a = await user(app);
    assertErr(await a.post('/api/posts').type('form').send('title=t&body=b&status=draft'), 400, 'VALIDATION');
    assertErr(
      await a.post('/api/posts').set('Content-Type', 'text/plain').send(JSON.stringify({ title: 't', body: 'b', status: 'draft' })),
      400,
      'VALIDATION',
    );
    const list = await a.get('/api/me/posts');
    assert.equal(list.body.total, 0);
  });
  it('AC-14 logout with no body returns 204', async () => {
    const app = newApp();
    const a = await user(app);
    const res = await a.post('/api/auth/logout');
    assert.equal(res.status, 204);
    const again = await request(app).post('/api/auth/logout');
    assert.equal(again.status, 204);
  });
  it('AC-14 malformed JSON is 400 VALIDATION', async () => {
    const app = newApp();
    const a = await user(app);
    const res = await a.post('/api/posts').set('Content-Type', 'application/json').send('{"title": ');
    assertErr(res, 400, 'VALIDATION');
  });
  it('AC-14 body over 100kb is 400 (413 is a FAIL)', async () => {
    const app = newApp();
    const a = await user(app);
    const res = await a
      .post('/api/posts')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 't', body: 'a'.repeat(200_000), status: 'draft' }));
    assert.notEqual(res.status, 413, 'got 413, spec requires 400');
    assertErr(res, 400, 'VALIDATION');
  });
});

describe('AC-15 no leaks', () => {
  it('AC-15 no email or password fields anywhere, author exactly {username, displayName}', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const pa = await mk(a, 'Leak check A', 'plain body');
    await mk(b, 'Leak check B', 'plain body', 'draft');
    const responses = [
      await a.post('/api/posts').send({ title: 'Leak check C', body: 'plain body', status: 'published' }),
      await request(app).get(`/api/posts/${pa.slug}`),
      await a.patch(`/api/posts/${pa.slug}`).send({ title: 'Leak check A2' }),
      await request(app).get('/api/posts'),
      await a.get('/api/me/posts'),
      await b.get('/api/me/posts'),
      await request(app).get(`/api/users/${uname(a)}/posts`),
    ];
    for (const res of responses) {
      assert.ok(res.status === 200 || res.status === 201);
      const text = JSON.stringify(res.body);
      for (const bad of ['email', 'password_hash', 'passwordHash', 'password', '@example.com']) {
        assert.ok(!text.includes(bad), `leak "${bad}" in ${text}`);
      }
      const posts = res.body.post ? [res.body.post] : res.body.items;
      for (const p of posts) {
        assert.deepEqual(Object.keys(p.author).sort(), ['displayName', 'username']);
      }
    }
  });
});

describe('AC-17 injection', () => {
  it('AC-17 SQL-looking title is stored literally and the table survives', async () => {
    const app = newApp();
    const a = await user(app);
    const evil = `'; DROP TABLE posts; --`;
    const p = await mk(a, evil, `'; DROP TABLE users; --`);
    assert.equal(p.title, evil);
    assert.equal(p.body, `'; DROP TABLE users; --`);
    assert.match(p.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    const g = await request(app).get(`/api/posts/${p.slug}`);
    assert.equal(g.status, 200);
    assert.equal(g.body.post.title, evil);
    const again = await mk(a, 'Still works');
    assert.equal(again.title, 'Still works');
    const list = await request(app).get('/api/posts');
    assert.equal(list.body.total, 2);
    const me = await a.get('/api/auth/me');
    assert.ok(me.body.user, 'users table should survive');
  });
  it('AC-17 injection in slug path and query params is harmless', async () => {
    const app = newApp();
    const a = await user(app);
    await mk(a, 'Safe');
    const r1 = await request(app).get(`/api/posts/${encodeURIComponent(`x' OR '1'='1`)}`);
    assertErr(r1, 404, 'NOT_FOUND');
    const r2 = await a.get(`/api/me/posts?status=${encodeURIComponent(`draft' OR '1'='1`)}`);
    assertErr(r2, 400, 'VALIDATION');
    const r3 = await request(app).get('/api/posts?page=1;DROP TABLE posts');
    assertErr(r3, 400, 'VALIDATION');
    assert.equal((await request(app).get('/api/posts')).body.total, 1);
  });
});

describe('AC-18 multi-user feed', () => {
  it('AC-18 interleaved posts from two users, newest first', async () => {
    const app = newApp();
    const a = await user(app);
    const b = await user(app);
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      const who = i % 2 === 0 ? a : b;
      order.push((await mk(who, `Interleaved ${i}`)).slug);
      await sleep(5);
    }
    await mk(a, 'Draft ignored', 'x', 'draft');
    const res = await request(app).get('/api/posts?page=1');
    assert.equal(res.body.total, 6);
    assert.deepEqual(res.body.items.map((i: any) => i.slug), [...order].reverse());
    const authors = new Set(res.body.items.map((i: any) => i.author.username));
    assert.deepEqual([...authors].sort(), [uname(a), uname(b)].sort());
    // each user's profile list only contains their own posts
    const pa = await request(app).get(`/api/users/${uname(a)}/posts`);
    assert.equal(pa.body.total, 3);
    assert.ok(pa.body.items.every((i: any) => i.author.username === uname(a)));
  });
});
