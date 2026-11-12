import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
process.env['BCRYPT_ROUNDS'] = '4';
const load = () => import(pathToFileURL(path.resolve('api/auth/password.ts')).href);

test('password: hashPassword returns a bcrypt-format hash, not the plaintext', async () => {
  const { hashPassword } = await load();
  const h = await hashPassword('correct horse');
  assert.ok(typeof h === 'string' && h.startsWith('$2'), h);
  assert.notEqual(h, 'correct horse');
});
test('password: verifyPassword true for right password, false for wrong', async () => {
  const { hashPassword, verifyPassword } = await load();
  const h = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong horse', h), false);
});
test('password: same password hashes differently (salted)', async () => {
  const { hashPassword } = await load();
  assert.notEqual(await hashPassword('samepassword'), await hashPassword('samepassword'));
});
