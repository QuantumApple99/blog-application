import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, mods, signupSid } from './__testutil__/app';

function run(mw: any, req: any) {
  const calls: any[][] = [];
  const res: any = {};
  mw(req, res, (...a: any[]) => calls.push(a));
  return calls;
}
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('loadUser', () => {
  const bad: [string, any][] = [
    ['array', ['a', 'b']], ['empty string', ''], ['junk', 'not-a-real-session'],
    ['object', { x: 1 }], ['very long', 'z'.repeat(10000)], ['number', 42], ['sql-ish', "' OR 1=1 --"],
  ];
  for (const [n, v] of bad) {
    test(`ignores malformed sid cookie (${n}): next() w/o error, req.user unset`, async () => {
      const { m, db } = await makeApp();
      const req: any = { cookies: { sid: v }, headers: {} };
      const calls = run(m.auth.loadUser(db), req);
      await settle();
      assert.equal(calls.length, 1, 'next called exactly once');
      assert.equal(calls[0][0], undefined, 'next called without error: ' + String(calls[0][0]));
      assert.equal(req.user, undefined);
    });
  }
  test('no cookies object at all: next() w/o error, req.user unset', async () => {
    const { m, db } = await makeApp();
    const req: any = { headers: {} };
    const calls = run(m.auth.loadUser(db), req);
    await settle();
    assert.equal(calls.length, 1); assert.equal(calls[0][0], undefined); assert.equal(req.user, undefined);
  });
  test('valid session sets req.user', async () => {
    const { app, m, db } = await makeApp();
    const sid = await signupSid(app);
    const req: any = { cookies: { sid }, headers: {} };
    const calls = run(m.auth.loadUser(db), req);
    await settle();
    assert.equal(calls.length, 1); assert.equal(calls[0][0], undefined);
    assert.ok(req.user, 'req.user set');
  });
});

describe('requireAuth', () => {
  test('no user -> next(ApiError 401 UNAUTHENTICATED)', async () => {
    const { m } = await makeApp();
    const calls = run(m.auth.requireAuth, { headers: {} });
    assert.equal(calls.length, 1);
    const err = calls[0][0];
    assert.ok(err instanceof m.ApiError, 'is ApiError');
    assert.equal(err.status, 401); assert.equal(err.code, 'UNAUTHENTICATED');
  });
  test('with user -> next() with no args', async () => {
    const { m } = await makeApp();
    const calls = run(m.auth.requireAuth, { headers: {}, user: { id: 1 } });
    assert.equal(calls.length, 1); assert.equal(calls[0][0], undefined);
  });
});
