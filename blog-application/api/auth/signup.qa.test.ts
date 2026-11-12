import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, ALICE, signup, sidHeader, deepKeys, request } from './__testutil__/app';

describe('signup success', () => {
  test('201 {user} with id+email, no password keys, cookie set, hash bcrypt', async () => {
    const { app, db } = await makeApp();
    const res = await signup(app);
    assert.equal(res.status, 201);
    assert.ok(res.body.user);
    assert.equal(typeof res.body.user.id, 'number');
    assert.equal(res.body.user.email, ALICE.email);
    assert.equal(res.body.user.username, 'alice');
    const keys = deepKeys(res.body).map((k) => k.toLowerCase());
    for (const bad of ['password', 'password_hash', 'passwordhash']) assert.ok(!keys.includes(bad), 'leaked key ' + bad);
    assert.ok(sidHeader(res), 'Set-Cookie sid present');
    const row = db.prepare('SELECT password_hash FROM users WHERE username=?').get('alice');
    assert.ok(row.password_hash.startsWith('$2'));
    assert.notEqual(row.password_hash, ALICE.password);
  });
  test('username/email are lowercased on input', async () => {
    const { app } = await makeApp();
    const res = await signup(app, { username: 'BobSmith', email: 'Bob@Example.COM' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.username, 'bobsmith');
    assert.equal(res.body.user.email, 'bob@example.com');
  });
});

describe('signup validation', () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['bad username chars', { username: 'bad name!' }, 'username'],
    ['username with dash', { username: 'a-b-c' }, 'username'],
    ['username too short', { username: 'ab' }, 'username'],
    ['username too long (21)', { username: 'a'.repeat(21) }, 'username'],
    ['email without @', { email: 'nope.example.com' }, 'email'],
    ['password 7 chars', { password: '1234567' }, 'password'],
    ['password > 200', { password: 'p'.repeat(201) }, 'password'],
    ['empty displayName', { displayName: '' }, 'displayName'],
    ['whitespace displayName', { displayName: '    ' }, 'displayName'],
    ['displayName > 50', { displayName: 'd'.repeat(51) }, 'displayName'],
    ['non-string username', { username: 123 }, 'username'],
    ['non-string email', { email: { a: 1 } }, 'email'],
    ['non-string displayName', { displayName: ['x'] }, 'displayName'],
    ['non-string password', { password: 12345678 }, 'password'],
    ['null password', { password: null }, 'password'],
  ];
  for (const [name, over, field] of cases) {
    test(`400 VALIDATION: ${name}`, async () => {
      const { app, db } = await makeApp();
      const res = await signup(app, over);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION');
      assert.equal(typeof res.body.error.message, 'string');
      assert.ok(res.body.error.fields && field in res.body.error.fields, JSON.stringify(res.body));
      assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c, 0);
    });
  }
  for (const f of ['username', 'email', 'displayName', 'password']) {
    test(`400 VALIDATION: missing ${f}`, async () => {
      const { app } = await makeApp();
      const body: any = { ...ALICE }; delete body[f];
      const res = await request(app).post('/api/auth/signup').send(body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION');
      assert.ok(f in res.body.error.fields);
    });
  }
  test('400 VALIDATION: empty body reports all four fields', async () => {
    const { app } = await makeApp();
    const res = await request(app).post('/api/auth/signup').send({});
    assert.equal(res.status, 400);
    for (const f of ['username', 'email', 'displayName', 'password']) assert.ok(f in res.body.error.fields, f);
  });
  test('multiple failures reported together', async () => {
    const { app } = await makeApp();
    const res = await signup(app, { username: '!', email: 'x', password: 'short', displayName: '' });
    assert.equal(res.status, 400);
    for (const f of ['username', 'email', 'password', 'displayName']) assert.ok(f in res.body.error.fields, f);
  });
  test('boundary values accepted: username 3 and 20, password 8, displayName 50', async () => {
    const { app } = await makeApp();
    assert.equal((await signup(app, { username: 'abc', email: 'a@x.com', password: '12345678', displayName: 'd'.repeat(50) })).status, 201);
    assert.equal((await signup(app, { username: 'a'.repeat(20), email: 'b@x.com' })).status, 201);
  });
});

describe('signup duplicates', () => {
  test('duplicate username -> 409 USERNAME_TAKEN', async () => {
    const { app } = await makeApp();
    await signup(app);
    const res = await signup(app, { email: 'other@example.com' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'USERNAME_TAKEN');
  });
  test('duplicate email -> 409 EMAIL_TAKEN', async () => {
    const { app } = await makeApp();
    await signup(app);
    const res = await signup(app, { username: 'bob' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });
  test('username case variants collide (Alice/alice)', async () => {
    const { app } = await makeApp();
    await signup(app);
    const res = await signup(app, { username: 'Alice', email: 'other@example.com' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'USERNAME_TAKEN');
  });
  test('email case variants collide (A@x.com/a@x.com)', async () => {
    const { app } = await makeApp();
    await signup(app, { email: 'a@x.com' });
    const res = await signup(app, { username: 'bob', email: 'A@X.com' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });
  test('failed duplicate does not set a cookie', async () => {
    const { app } = await makeApp();
    await signup(app);
    const res = await signup(app, { email: 'other@example.com' });
    assert.equal(sidHeader(res), undefined);
  });
});
