process.env['BCRYPT_ROUNDS'] = '4';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createApi } from './index';
import { openDb } from './db';

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('AC-16 persistence', () => {
  it('AC-16 data and session survive a restart; reopening is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weblog-qa-'));
    dirs.push(dir);
    const file = join(dir, 'weblog.db');

    // first "process"
    const db1 = openDb(file);
    const app1 = express().use('/api', createApi({ db: db1 }));
    const agent1 = request.agent(app1);
    const su = await agent1
      .post('/api/auth/signup')
      .send({ username: 'persist1', email: 'persist1@example.com', displayName: 'Persist One', password: 'password123' });
    assert.equal(su.status, 201);
    const rawCookies = su.headers['set-cookie'] as unknown as string[] | string;
    const cookieHeader = (Array.isArray(rawCookies) ? rawCookies : [rawCookies]).map((c) => c.split(';')[0]).join('; ');
    assert.match(cookieHeader, /^sid=[0-9a-f]{64}/);
    const created = await agent1.post('/api/posts').send({ title: 'Survivor', body: '# kept **safe**', status: 'published' });
    assert.equal(created.status, 201);
    const draft = await agent1.post('/api/posts').send({ title: 'Survivor draft', body: 'd', status: 'draft' });
    assert.equal(draft.status, 201);
    const before = (await request(app1).get(`/api/posts/${created.body.post.slug}`)).body;
    const feedBefore = (await request(app1).get('/api/posts')).body;
    db1.close();

    // restart: fresh db handle + fresh app on the same file
    const db2 = openDb(file);
    const app2 = express().use('/api', createApi({ db: db2 }));
    const after2 = await request(app2).get(`/api/posts/${created.body.post.slug}`);
    assert.equal(after2.status, 200);
    assert.deepEqual(after2.body, before);
    assert.deepEqual((await request(app2).get('/api/posts')).body, feedBefore);

    // old session cookie still valid
    const me = await request(app2).get('/api/auth/me').set('Cookie', cookieHeader);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.username, 'persist1');
    // and still authorizes writes, and sees its own draft
    const mine = await request(app2).get('/api/me/posts').set('Cookie', cookieHeader);
    assert.equal(mine.status, 200);
    assert.equal(mine.body.total, 2);
    const patched = await request(app2)
      .patch(`/api/posts/${created.body.post.slug}`)
      .set('Cookie', cookieHeader)
      .send({ body: 'edited after restart' });
    assert.equal(patched.status, 200);
    // without the cookie it is anonymous
    const anon = await request(app2).get('/api/auth/me');
    assert.equal(anon.body.user, null);
    db2.close();

    // third open: idempotent schema creation, no data loss or duplication, edit persisted
    const db3 = openDb(file);
    const db3b = openDb(file); // two handles on the same file must also be fine
    const app3 = express().use('/api', createApi({ db: db3 }));
    const feed3 = (await request(app3).get('/api/posts')).body;
    assert.equal(feed3.total, 1);
    assert.equal(feed3.items[0].slug, created.body.post.slug);
    const g3 = await request(app3).get(`/api/posts/${created.body.post.slug}`);
    assert.equal(g3.body.post.body, 'edited after restart');
    assert.equal(g3.body.post.createdAt, before.post.createdAt);
    const me3 = await request(app3).get('/api/auth/me').set('Cookie', cookieHeader);
    assert.equal(me3.body.user.username, 'persist1');
    db3b.close();
    db3.close();
  });

  it('AC-16 a fresh empty file DB works and a second user can still sign up after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weblog-qa-'));
    dirs.push(dir);
    const file = join(dir, 'nested-ok.db');
    const db1 = openDb(file);
    const app1 = express().use('/api', createApi({ db: db1 }));
    assert.deepEqual((await request(app1).get('/api/posts')).body.items, []);
    db1.close();
    const db2 = openDb(file);
    const app2 = express().use('/api', createApi({ db: db2 }));
    const s = await request(app2)
      .post('/api/auth/signup')
      .send({ username: 'second1', email: 'second1@example.com', displayName: 'Second', password: 'password123' });
    assert.equal(s.status, 201);
    db2.close();
  });
});
