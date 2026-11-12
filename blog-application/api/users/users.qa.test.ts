import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, ALICE, signup, signupSid, cookieHdr, deepKeys, request } from '../auth/__testutil__/app';

const patch = (app: any, sid: string | undefined, body: any) => {
  const r = request(app).patch('/api/users/me'); if (sid) r.set('Cookie', cookieHdr(sid)); return r.send(body);
};

describe('GET /users/:username', () => {
  test('404 NOT_FOUND standard body for unknown user', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/api/users/nobody');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(typeof res.body.error.message, 'string');
  });
  test('200 {user:{username,displayName,bio,createdAt}} only; no email/id', async () => {
    const { app } = await makeApp(); await signup(app);
    const res = await request(app).get('/api/users/alice');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.user).sort(), ['bio', 'createdAt', 'displayName', 'username']);
    assert.equal(res.body.user.bio, '');
    assert.ok(!Number.isNaN(Date.parse(res.body.user.createdAt)));
    assert.ok(!JSON.stringify(res.body).includes(ALICE.email));
  });
  test('case-insensitive lookup (/users/ALICE)', async () => {
    const { app } = await makeApp(); await signup(app);
    const res = await request(app).get('/api/users/ALICE');
    assert.equal(res.status, 200); assert.equal(res.body.user.username, 'alice');
  });
});

describe('PATCH /users/me', () => {
  test('401 UNAUTHENTICATED with no cookie', async () => {
    const { app } = await makeApp();
    const res = await patch(app, undefined, { displayName: 'X' });
    assert.equal(res.status, 401); assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });
  test('200 + persists, visible via GET /users/:u and /auth/me', async () => {
    const { app } = await makeApp(); const sid = await signupSid(app);
    const res = await patch(app, sid, { displayName: 'Alice Cooper', bio: 'Hello there' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.displayName, 'Alice Cooper');
    assert.equal(res.body.user.bio, 'Hello there');
    assert.equal(res.body.user.email, ALICE.email);
    const pub = await request(app).get('/api/users/alice');
    assert.equal(pub.body.user.displayName, 'Alice Cooper'); assert.equal(pub.body.user.bio, 'Hello there');
    const m = await request(app).get('/api/auth/me').set('Cookie', cookieHdr(sid));
    assert.equal(m.body.user.displayName, 'Alice Cooper'); assert.equal(m.body.user.bio, 'Hello there');
  });
  test('bio-only patch works and can clear bio to empty', async () => {
    const { app } = await makeApp(); const sid = await signupSid(app);
    assert.equal((await patch(app, sid, { bio: 'x' })).body.user.bio, 'x');
    const r = await patch(app, sid, { bio: '' });
    assert.equal(r.status, 200); assert.equal(r.body.user.bio, '');
    assert.equal(r.body.user.displayName, 'Alice');
  });
  const invalid: [string, any, string][] = [
    ['empty displayName', { displayName: '' }, 'displayName'],
    ['whitespace displayName', { displayName: '   ' }, 'displayName'],
    ['displayName > 50', { displayName: 'd'.repeat(51) }, 'displayName'],
    ['non-string displayName', { displayName: 5 }, 'displayName'],
    ['bio > 500', { bio: 'b'.repeat(501) }, 'bio'],
    ['non-string bio', { bio: 5 }, 'bio'],
  ];
  for (const [n, body, f] of invalid) {
    test(`400 VALIDATION: ${n}`, async () => {
      const { app } = await makeApp(); const sid = await signupSid(app);
      const res = await patch(app, sid, body);
      assert.equal(res.status, 400); assert.equal(res.body.error.code, 'VALIDATION');
      assert.ok(res.body.error.fields && f in res.body.error.fields);
      assert.equal((await request(app).get('/api/users/alice')).body.user.displayName, 'Alice');
    });
  }
  test('boundaries accepted: displayName 50, bio 500', async () => {
    const { app } = await makeApp(); const sid = await signupSid(app);
    assert.equal((await patch(app, sid, { displayName: 'd'.repeat(50), bio: 'b'.repeat(500) })).status, 200);
  });
  for (const [n, body] of [['empty object', {}], ['only unknown keys', { foo: 1 }], ['only username/email', { username: 'x', email: 'x@y.com' }]] as [string, any][]) {
    test(`400 VALIDATION: no recognised keys (${n})`, async () => {
      const { app } = await makeApp(); const sid = await signupSid(app);
      const res = await patch(app, sid, body);
      assert.equal(res.status, 400); assert.equal(res.body.error.code, 'VALIDATION');
    });
  }
  test('unknown keys ignored when a valid key is present', async () => {
    const { app } = await makeApp(); const sid = await signupSid(app);
    const res = await patch(app, sid, { displayName: 'New Name', foo: 'bar', id: 999 });
    assert.equal(res.status, 200); assert.equal(res.body.user.displayName, 'New Name');
    assert.notEqual(res.body.user.id, 999);
  });
  test('username/email/password unchanged even if supplied', async () => {
    const { app, db } = await makeApp(); const sid = await signupSid(app);
    const before = db.prepare('SELECT username,email,password_hash FROM users').get();
    const res = await patch(app, sid, { displayName: 'N', username: 'evil', email: 'evil@x.com', password: 'newpassword99', password_hash: 'x' });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice'); assert.equal(res.body.user.email, ALICE.email);
    assert.deepEqual(db.prepare('SELECT username,email,password_hash FROM users').get(), before);
    const ok = await request(app).post('/api/auth/login').send({ username: 'alice', password: ALICE.password });
    assert.equal(ok.status, 200);
    const bad = await request(app).post('/api/auth/login').send({ username: 'alice', password: 'newpassword99' });
    assert.equal(bad.status, 401);
  });
  test('only affects the caller, not other users', async () => {
    const { app } = await makeApp(); const a = await signupSid(app);
    await signup(app, { username: 'bob', email: 'bob@example.com', displayName: 'Bob' });
    await patch(app, a, { displayName: 'Changed' });
    assert.equal((await request(app).get('/api/users/bob')).body.user.displayName, 'Bob');
  });
});

describe('GET /users/:username/posts', () => {
  function seed(db: any, userId: number, n: number, opts: { draft?: boolean } = {}) {
    const ins = db.prepare(`INSERT INTO posts(author_id,slug,title,body,body_html,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      const ts = new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();
      const r = ins.run(userId, `${opts.draft ? 'd' : 'p'}-${userId}-${i}-${Math.random().toString(36).slice(2, 7)}`, `Title ${i}`, `Body **${i}** text`, `<p>Body <strong>${i}</strong> text</p>`, opts.draft ? 'draft' : 'published', ts, ts, opts.draft ? null : ts);
      ids.push(Number(r.lastInsertRowid));
    }
    return ids;
  }
  const uid = (db: any, u: string) => db.prepare('SELECT id FROM users WHERE username=?').get(u).id as number;

  test('404 for unknown user', async () => {
    const { app } = await makeApp();
    const res = await request(app).get('/api/users/nobody/posts');
    assert.equal(res.status, 404); assert.equal(res.body.error.code, 'NOT_FOUND');
  });
  test('user with no posts: 200 empty page shape', async () => {
    const { app } = await makeApp(); await signup(app);
    const res = await request(app).get('/api/users/alice/posts');
    assert.equal(res.status, 200);
    assert.equal(res.body.items.length, 0); assert.equal(res.body.page, 1); assert.equal(res.body.pageSize, 10); assert.equal(res.body.total, 0);
    assert.ok(res.body.totalPages === 0 || res.body.totalPages === 1);
  });
  test('drafts excluded; only own published posts', async () => {
    const { app, db } = await makeApp(); await signup(app);
    await signup(app, { username: 'bob', email: 'bob@example.com' });
    seed(db, uid(db, 'alice'), 3); seed(db, uid(db, 'alice'), 2, { draft: true }); seed(db, uid(db, 'bob'), 4);
    const res = await request(app).get('/api/users/alice/posts');
    assert.equal(res.status, 200); assert.equal(res.body.total, 3); assert.equal(res.body.items.length, 3);
    for (const p of res.body.items) { assert.equal(p.status, 'published'); assert.equal(p.author.username, 'alice'); }
  });
  test('PostSummary shape and no email/id of the user leaked', async () => {
    const { app, db } = await makeApp(); await signup(app);
    seed(db, uid(db, 'alice'), 1);
    const res = await request(app).get('/api/users/alice/posts');
    const p = res.body.items[0];
    for (const k of ['id', 'slug', 'title', 'excerpt', 'status', 'author', 'createdAt', 'updatedAt', 'publishedAt']) assert.ok(k in p, 'missing ' + k);
    assert.deepEqual(Object.keys(p.author).sort(), ['displayName', 'username']);
    assert.equal(p.author.displayName, 'Alice');
    assert.equal(typeof p.id, 'number'); assert.equal(typeof p.excerpt, 'string');
    assert.ok(!('body' in p) && !('html' in p), 'summary must not include body/html');
    assert.ok(!deepKeys(res.body).includes('email'));
    assert.ok(!JSON.stringify(res.body).includes(ALICE.email));
  });
  test('order: published_at DESC then id DESC (ties broken by id)', async () => {
    const { app, db } = await makeApp(); await signup(app);
    const u = uid(db, 'alice');
    const ins = db.prepare(`INSERT INTO posts(author_id,slug,title,body,body_html,status,created_at,updated_at,published_at) VALUES (?,?,?,?,?,'published',?,?,?)`);
    const t = (m: number) => new Date(Date.UTC(2026, 5, 1, 0, m)).toISOString();
    const a = Number(ins.run(u, 'a', 'A', '', '', t(0), t(0), t(5)).lastInsertRowid); // older id, newest time? no: t(5)
    const b = Number(ins.run(u, 'b', 'B', '', '', t(0), t(0), t(1)).lastInsertRowid);
    const c = Number(ins.run(u, 'c', 'C', '', '', t(0), t(0), t(5)).lastInsertRowid); // tie with a, higher id
    const d = Number(ins.run(u, 'd', 'D', '', '', t(0), t(0), t(3)).lastInsertRowid);
    const res = await request(app).get('/api/users/alice/posts');
    assert.deepEqual(res.body.items.map((p: any) => p.id), [c, a, d, b]);
  });
  test('pagination: 25 posts -> 10/10/5, totalPages 3, total 25', async () => {
    const { app, db } = await makeApp(); await signup(app);
    seed(db, uid(db, 'alice'), 25);
    const r1 = await request(app).get('/api/users/alice/posts');
    const r2 = await request(app).get('/api/users/alice/posts?page=2');
    const r3 = await request(app).get('/api/users/alice/posts?page=3');
    assert.deepEqual([r1.body.items.length, r2.body.items.length, r3.body.items.length], [10, 10, 5]);
    for (const [r, pg] of [[r1, 1], [r2, 2], [r3, 3]] as any) {
      assert.equal(r.body.page, pg); assert.equal(r.body.pageSize, 10); assert.equal(r.body.total, 25); assert.equal(r.body.totalPages, 3);
    }
    const all = [...r1.body.items, ...r2.body.items, ...r3.body.items].map((p: any) => p.id);
    assert.equal(new Set(all).size, 25);
  });
  test('exactly 10 posts -> totalPages 1, page=2 empty', async () => {
    const { app, db } = await makeApp(); await signup(app);
    seed(db, uid(db, 'alice'), 10);
    const r1 = await request(app).get('/api/users/alice/posts');
    assert.equal(r1.body.totalPages, 1); assert.equal(r1.body.items.length, 10);
    const r2 = await request(app).get('/api/users/alice/posts?page=2');
    assert.equal(r2.status, 200); assert.equal(r2.body.items.length, 0);
  });
  for (const bad of ['0', 'abc', '1.5', '-1', '']) {
    test(`400 VALIDATION for page=${JSON.stringify(bad)}`, async () => {
      const { app } = await makeApp(); await signup(app);
      const res = await request(app).get('/api/users/alice/posts?page=' + bad);
      assert.equal(res.status, 400); assert.equal(res.body.error.code, 'VALIDATION');
    });
  }
  test('beyond last page -> 200 empty items', async () => {
    const { app, db } = await makeApp(); await signup(app);
    seed(db, uid(db, 'alice'), 3);
    const res = await request(app).get('/api/users/alice/posts?page=99');
    assert.equal(res.status, 200); assert.deepEqual(res.body.items, []); assert.equal(res.body.total, 3);
  });
  test('username lookup is case-insensitive', async () => {
    const { app, db } = await makeApp(); await signup(app);
    seed(db, uid(db, 'alice'), 2);
    const res = await request(app).get('/api/users/ALICE/posts');
    assert.equal(res.status, 200); assert.equal(res.body.items.length, 2);
  });
});
