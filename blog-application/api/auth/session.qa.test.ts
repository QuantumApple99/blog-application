import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeApp, mods, ALICE, signup, signupSid, sidHeader, sidValue, attrs, cookieHdr, withEnv, request } from './__testutil__/app';

const login = (app: any) => request(app).post('/api/auth/login').send({ username: 'alice', password: ALICE.password });
const me = (app: any, sid?: string) => { const r = request(app).get('/api/auth/me'); return sid ? r.set('Cookie', cookieHdr(sid)) : r; };

describe('cookie flags', () => {
  for (const [label, doReq] of [
    ['signup', (app: any) => signup(app)],
    ['login', async (app: any) => { await signup(app); return login(app); }],
  ] as const) {
    test(`${label}: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, no Secure, value 64 hex`, async () => {
      await withEnv({ NODE_ENV: 'test', COOKIE_SECURE: undefined }, async () => {
        const { app } = await makeApp();
        const res = await doReq(app);
        const h = sidHeader(res)!; assert.ok(h);
        const a = attrs(h);
        assert.ok(a.includes('httponly'), h);
        assert.ok(a.includes('samesite=lax'), h);
        assert.ok(a.includes('path=/'), h);
        assert.ok(a.includes('max-age=2592000'), h);
        assert.ok(!a.includes('secure'), h);
        assert.match(sidValue(res), /^[0-9a-f]{64}$/);
      });
    });
    test(`${label}: Secure when NODE_ENV=production`, async () => {
      await withEnv({ NODE_ENV: 'production', COOKIE_SECURE: undefined }, async () => {
        const { app } = await makeApp();
        const res = await doReq(app);
        assert.ok(attrs(sidHeader(res)!).includes('secure'), sidHeader(res));
      });
    });
    test(`${label}: no Secure when NODE_ENV=production and COOKIE_SECURE=false`, async () => {
      await withEnv({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }, async () => {
        const { app } = await makeApp();
        const res = await doReq(app);
        assert.ok(!attrs(sidHeader(res)!).includes('secure'), sidHeader(res));
      });
    });
  }
});

describe('/auth/me', () => {
  test('logged out -> 200 {user:null}', async () => {
    const { app } = await makeApp();
    const res = await me(app);
    assert.equal(res.status, 200); assert.deepEqual(res.body, { user: null });
  });
  test('garbage sid -> 200 {user:null}', async () => {
    const { app } = await makeApp();
    for (const s of ['garbage', '0'.repeat(64), '%00', "' OR 1=1 --"]) {
      const res = await request(app).get('/api/auth/me').set('Cookie', 'sid=' + encodeURIComponent(s));
      assert.equal(res.status, 200, s); assert.deepEqual(res.body, { user: null }, s);
    }
  });
  test('valid sid -> own Me with id and email', async () => {
    const { app } = await makeApp();
    const sid = await signupSid(app);
    const res = await me(app, sid);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice');
    assert.equal(res.body.user.email, ALICE.email);
    assert.equal(typeof res.body.user.id, 'number');
  });
  test('shows only own data: two users each see themselves', async () => {
    const { app } = await makeApp();
    const a = await signupSid(app);
    const b = await signupSid(app, { username: 'bob', email: 'bob@example.com', displayName: 'Bob' });
    assert.equal((await me(app, a)).body.user.username, 'alice');
    const rb = await me(app, b);
    assert.equal(rb.body.user.username, 'bob');
    assert.ok(!JSON.stringify(rb.body).includes('alice'));
  });
});

describe('logout', () => {
  test('valid cookie -> 204; cookie dead after; session row gone; cookie cleared', async () => {
    const { app, db } = await makeApp();
    const sid = await signupSid(app);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions WHERE id=?').get(sid).c, 1);
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookieHdr(sid));
    assert.equal(res.status, 204);
    const h = sidHeader(res); assert.ok(h, 'clearing Set-Cookie');
    const a = attrs(h!);
    const cleared = a.includes('max-age=0') || a.some((x) => x.startsWith('expires=') && new Date(x.slice(8)).getTime() < Date.now());
    assert.ok(cleared, h); assert.ok(a.includes('path=/'), h);
    assert.deepEqual((await me(app, sid)).body, { user: null });
    assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions WHERE id=?').get(sid).c, 0);
  });
  test('logout only kills that session; other session survives', async () => {
    const { app } = await makeApp();
    const s1 = await signupSid(app);
    const s2 = sidValue(await login(app));
    await request(app).post('/api/auth/logout').set('Cookie', cookieHdr(s1));
    assert.equal((await me(app, s2)).body.user.username, 'alice');
  });
  test('no cookie -> 204 (idempotent)', async () => {
    const { app } = await makeApp();
    assert.equal((await request(app).post('/api/auth/logout')).status, 204);
  });
  test('garbage cookie -> 204', async () => {
    const { app } = await makeApp();
    assert.equal((await request(app).post('/api/auth/logout').set('Cookie', 'sid=garbage')).status, 204);
  });
});

describe('persistence & expiry', () => {
  test('cookie still authenticates after closing and reopening the file DB', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-auth-')), 'weblog.db');
    try {
      const a = await makeApp(file);
      const sid = await signupSid(a.app);
      a.db.close();
      const m = await mods();
      const db2 = m.openDb(file);
      const b = await makeApp(file, db2);
      const res = await me(b.app, sid);
      assert.equal(res.body.user?.username, 'alice');
      db2.close();
    } finally {
      for (const s of ['', '-wal', '-shm']) fs.rmSync(file + s, { force: true });
    }
  });
  test('expired session: /auth/me null, PATCH /users/me 401, row deleted', async () => {
    const { app, db } = await makeApp();
    const sid = await signupSid(app);
    db.prepare('UPDATE sessions SET expires_at=? WHERE id=?').run(new Date(Date.now() - 60_000).toISOString(), sid);
    assert.deepEqual((await me(app, sid)).body, { user: null });
    assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions WHERE id=?').get(sid).c, 0);
  });
  test('expired session: PATCH /users/me -> 401 UNAUTHENTICATED and row deleted', async () => {
    const { app, db } = await makeApp();
    const sid = await signupSid(app);
    db.prepare('UPDATE sessions SET expires_at=? WHERE id=?').run(new Date(Date.now() - 60_000).toISOString(), sid);
    const res = await request(app).patch('/api/users/me').set('Cookie', cookieHdr(sid)).send({ displayName: 'X' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions WHERE id=?').get(sid).c, 0);
  });
  test('session expires_at is roughly 30 days ahead', async () => {
    const { app, db } = await makeApp();
    const sid = await signupSid(app);
    const row = db.prepare('SELECT expires_at FROM sessions WHERE id=?').get(sid);
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    assert.ok(days > 29 && days < 31, String(days));
  });
});
