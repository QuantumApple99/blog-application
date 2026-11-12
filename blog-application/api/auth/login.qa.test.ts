import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, ALICE, signup, sidHeader, sidValue, deepKeys, request } from './__testutil__/app';

const login = (app: any, body: any) => request(app).post('/api/auth/login').send(body);

describe('login', () => {
  test('success by username: 200 {user: Me} + cookie, no password keys', async () => {
    const { app } = await makeApp(); await signup(app);
    const res = await login(app, { username: 'alice', password: ALICE.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice');
    assert.equal(res.body.user.email, ALICE.email);
    assert.equal(typeof res.body.user.id, 'number');
    assert.ok(sidHeader(res));
    assert.match(sidValue(res), /^[0-9a-f]{64}$/);
    const keys = deepKeys(res.body).map((k) => k.toLowerCase());
    for (const bad of ['password', 'password_hash', 'passwordhash']) assert.ok(!keys.includes(bad));
  });
  test('login by email is case-insensitive', async () => {
    const { app } = await makeApp(); await signup(app);
    const res = await login(app, { username: 'ALICE@Example.COM', password: ALICE.password });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'alice');
  });
  test('wrong password and unknown user: identical 401 status + body INVALID_CREDENTIALS', async () => {
    const { app } = await makeApp(); await signup(app);
    const a = await login(app, { username: 'alice', password: 'wrong-password' });
    const b = await login(app, { username: 'nobody', password: 'wrong-password' });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
    assert.equal(a.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(a.body.error.message, 'Invalid username or password');
    assert.equal(sidHeader(a), undefined);
    assert.equal(sidHeader(b), undefined);
  });
  test('unknown email also gives the same 401 body', async () => {
    const { app } = await makeApp(); await signup(app);
    const a = await login(app, { username: 'alice', password: 'wrong-password' });
    const b = await login(app, { username: 'nobody@example.com', password: 'whatever123' });
    assert.equal(b.status, 401);
    assert.deepEqual(a.body, b.body);
  });
  const missing: [string, any][] = [
    ['empty body', {}], ['missing password', { username: 'alice' }], ['missing username', { password: 'password123' }],
    ['non-string username', { username: 5, password: 'password123' }], ['non-string password', { username: 'alice', password: { a: 1 } }],
  ];
  for (const [n, body] of missing) {
    test(`400 VALIDATION: ${n}`, async () => {
      const { app } = await makeApp(); await signup(app);
      const res = await login(app, body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION');
    });
  }
});
