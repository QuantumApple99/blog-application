import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { ApiError, errorHandler, notFound } from './errors';

function app() {
  const a = express();
  a.use(express.json({ limit: '100kb' }));
  a.post('/echo', (req, res) => res.json(req.body));
  a.get('/api-error', () => {
    throw new ApiError(409, 'USERNAME_TAKEN', 'taken');
  });
  a.get('/validation', () => {
    throw ApiError.validation({ title: 'required' });
  });
  a.get('/boom', () => {
    throw new Error('secret db password');
  });
  a.use(notFound);
  a.use(errorHandler);
  return a;
}

test('ApiError helpers', () => {
  const v = ApiError.validation({ a: 'b' });
  assert.deepEqual([v.status, v.code, v.message, v.fields], [400, 'VALIDATION', 'Invalid input', { a: 'b' }]);
  assert.equal(ApiError.validation({}, 'x').message, 'x');
  assert.deepEqual([ApiError.unauthenticated().status, ApiError.unauthenticated().code], [401, 'UNAUTHENTICATED']);
  assert.deepEqual([ApiError.forbidden().status, ApiError.forbidden().code], [403, 'FORBIDDEN']);
  assert.deepEqual([ApiError.notFound().status, ApiError.notFound().code], [404, 'NOT_FOUND']);
  assert.ok(ApiError.notFound() instanceof Error);
  const e = new ApiError(409, 'EMAIL_TAKEN', 'm');
  assert.equal(e.fields, undefined);
});

test('ApiError produces the JSON body, fields omitted when undefined', async () => {
  const r = await request(app()).get('/api-error');
  assert.equal(r.status, 409);
  assert.deepEqual(r.body, { error: { code: 'USERNAME_TAKEN', message: 'taken' } });
  assert.ok(!('fields' in r.body.error));
  const v = await request(app()).get('/validation');
  assert.equal(v.status, 400);
  assert.deepEqual(v.body, { error: { code: 'VALIDATION', message: 'Invalid input', fields: { title: 'required' } } });
});

test('malformed JSON returns 400 VALIDATION', async () => {
  const r = await request(app()).post('/echo').set('Content-Type', 'application/json').send('{bad');
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, 'VALIDATION');
});

test('body over 100kb returns 400 VALIDATION', async () => {
  const r = await request(app())
    .post('/echo')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ x: 'a'.repeat(101 * 1024) }));
  assert.equal(r.status, 400);
  assert.deepEqual(r.body, { error: { code: 'VALIDATION', message: 'Request body too large' } });
});

test('thrown Error returns 500 INTERNAL with no leak', async (t) => {
  t.mock.method(console, 'error', () => {});
  const r = await request(app()).get('/boom');
  assert.equal(r.status, 500);
  assert.deepEqual(r.body, { error: { code: 'INTERNAL', message: 'Internal server error' } });
  assert.ok(!r.text.includes('secret'));
  assert.ok(!r.text.includes('at '));
});

test('notFound returns a 404 JSON body', async () => {
  const r = await request(app()).get('/nope');
  assert.equal(r.status, 404);
  assert.equal(r.body.error.code, 'NOT_FOUND');
  assert.equal(typeof r.body.error.message, 'string');
});

test('errorHandler delegates when headers already sent', () => {
  let nexted: unknown;
  const res = { headersSent: true } as never;
  errorHandler(new Error('x'), {} as never, res, (e?: unknown) => {
    nexted = e;
  });
  assert.ok(nexted instanceof Error);
});
