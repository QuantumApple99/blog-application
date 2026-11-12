process.env['BCRYPT_ROUNDS'] = '4';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createApi } from '../index';
import { openDb } from '../db';

const newApp = () => express().use('/api', createApi({ db: openDb(':memory:') }));
type App = ReturnType<typeof newApp>;

async function user(app: App, name: string) {
  const a = request.agent(app);
  const r = await a.post('/api/auth/signup').send({ username: name, email: `${name}@x.com`, displayName: name, password: 'password123' });
  assert.equal(r.status, 201);
  return a;
}
const mk = async (a: ReturnType<typeof request.agent>, title: string, status = 'published', body = 'hello') => {
  const r = await a.post('/api/posts').send({ title, body, status });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.post;
};

describe('posts routes', () => {
  it('happy path CRUD', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    const c = await a.post('/api/posts').send({ title: '  Hi  ', body: '# yo <script>x</script>', status: 'published' });
    assert.equal(c.status, 201);
    assert.equal(c.body.post.title, 'Hi');
    assert.equal(c.body.post.body, '# yo <script>x</script>');
    assert.ok(!c.body.post.html.includes('<script'));
    assert.equal(c.body.post.createdAt, c.body.post.updatedAt);
    assert.equal(c.body.post.publishedAt, c.body.post.createdAt);
    const g = await request(app).get('/api/posts/hi');
    assert.equal(g.status, 200);
    const l = await request(app).get('/api/posts');
    assert.equal(l.body.total, 1);
    assert.equal(l.headers['cache-control'], 'no-store');
    const p = await a.patch('/api/posts/hi').send({ title: 'Renamed' });
    assert.equal(p.status, 200);
    assert.equal(p.body.post.slug, 'hi');
    assert.ok(p.body.post.updatedAt > c.body.post.updatedAt);
    const d = await a.delete('/api/posts/hi');
    assert.equal(d.status, 204);
    assert.equal(d.text, '');
    assert.equal((await request(app).get('/api/posts/hi')).status, 404);
  });

  it('drafts: 404 for anon/others, visible to author; /me/posts', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    const b = await user(app, 'bob');
    await mk(a, 'Secret', 'draft');
    await mk(a, 'Public');
    assert.equal((await request(app).get('/api/posts/secret')).status, 404);
    assert.equal((await b.get('/api/posts/secret')).status, 404);
    assert.equal((await a.get('/api/posts/secret')).status, 200);
    assert.equal((await request(app).get('/api/posts')).body.total, 1);
    assert.equal((await a.get('/api/me/posts')).body.total, 2);
    assert.deepEqual((await a.get('/api/me/posts?status=draft')).body.items.map((i: any) => i.slug), ['secret']);
    const bad = await a.get('/api/me/posts?status=nope');
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.fields.status);
    assert.equal((await request(app).get('/api/me/posts')).status, 401);
    assert.equal((await a.get('/api/posts?page=0')).status, 400);
    assert.equal((await a.get('/api/posts?page=1&page=2')).status, 400);
  });

  it('create validation collects all field errors; 401 when anonymous', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    const r = await a.post('/api/posts').send({ title: '   ', body: 5 });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'VALIDATION');
    assert.deepEqual(Object.keys(r.body.error.fields).sort(), ['body', 'status', 'title']);
    assert.equal((await a.post('/api/posts').send({ title: 'x'.repeat(201), body: '', status: 'draft' })).status, 400);
    assert.equal((await a.post('/api/posts').send({ title: 'ok', body: '', status: 'draft' })).status, 201);
    assert.equal((await request(app).post('/api/posts').send({ title: 'a', body: '', status: 'draft' })).status, 401);
  });

  it('PATCH/DELETE order 401 -> 404 -> 403 -> 400, and status transitions', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    const b = await user(app, 'bob');
    await mk(a, 'Mine', 'draft');
    // 401 beats 404
    assert.equal((await request(app).patch('/api/posts/nope').send({})).status, 401);
    assert.equal((await request(app).delete('/api/posts/nope')).status, 401);
    // 404 beats 403 and 400
    assert.equal((await b.patch('/api/posts/nope').send({})).status, 404);
    assert.equal((await b.delete('/api/posts/nope')).status, 404);
    // 403 beats 400
    assert.equal((await b.patch('/api/posts/mine').send({})).status, 403);
    assert.equal((await b.patch('/api/posts/mine').send({ title: 'x' })).status, 403);
    assert.equal((await b.delete('/api/posts/mine')).status, 403);
    // 400
    assert.equal((await a.patch('/api/posts/mine').send({})).status, 400);
    assert.equal((await a.patch('/api/posts/mine').send({ foo: 1 })).status, 400);
    assert.equal((await a.patch('/api/posts/mine').send({ status: 'x', title: '' })).body.error.fields.title !== undefined, true);
    // transitions
    const pub = (await a.patch('/api/posts/mine').send({ status: 'published' })).body.post;
    assert.ok(pub.publishedAt);
    const again = (await a.patch('/api/posts/mine').send({ status: 'published', body: 'new' })).body.post;
    assert.equal(again.publishedAt, pub.publishedAt);
    assert.ok(again.html.includes('new'));
    assert.ok(again.updatedAt > pub.updatedAt);
    const back = (await a.patch('/api/posts/mine').send({ status: 'draft' })).body.post;
    assert.equal(back.publishedAt, null);
  });

  it('JSON guard, health, unknown route, malformed JSON', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    assert.deepEqual((await request(app).get('/api/health')).body, { ok: true });
    assert.equal((await request(app).get('/api/nope')).status, 404);
    const t = await a.post('/api/posts').type('text/plain').send('title=x');
    assert.equal(t.status, 400);
    assert.equal(t.body.error.fields._, 'Content-Type must be application/json');
    assert.equal((await a.post('/api/posts').set('Content-Type', 'application/json').send('{bad')).status, 400);
    assert.equal((await a.post('/api/auth/logout')).status, 204);
  });

  it('users/:username/posts shares the post serializer', async () => {
    const app = newApp();
    const a = await user(app, 'alice');
    await mk(a, 'One');
    await mk(a, 'Two', 'draft');
    const r = await request(app).get('/api/users/alice/posts');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.items.map((i: any) => i.slug), ['one']);
    assert.equal(r.body.totalPages, 1);
  });
});
