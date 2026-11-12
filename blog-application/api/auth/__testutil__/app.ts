import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import request from 'supertest';

process.env['BCRYPT_ROUNDS'] = '4';

const unwrap = (m: any) => (m && m.default && Object.keys(m).length <= 2 && !m.openDb && !m.loadUser && !m.ApiError && m.default ? m.default : m);
async function load(rel: string): Promise<any> {
  const abs = path.resolve(process.cwd(), rel);
  const m = await import(pathToFileURL(abs).href);
  return m.openDb || m.loadUser || m.ApiError || m.hashPassword ? m : unwrap(m);
}

export async function mods() {
  const dbm = await load('api/db.ts');
  const errm = await load('api/errors.ts');
  const auth = await load('api/auth/index.ts');
  return { openDb: dbm.openDb, errorHandler: errm.errorHandler, ApiError: errm.ApiError, auth };
}

export async function makeApp(dbPath = ':memory:', existingDb?: any) {
  const m = await mods();
  const db = existingDb ?? m.openDb(dbPath);
  const router = express.Router();
  router.use(express.json());
  router.use(cookieParser());
  router.use(m.auth.loadUser(db));
  router.use('/auth', m.auth.authRouter(db));
  router.use('/users', m.auth.usersRouter(db));
  const app = express();
  app.use('/api', router);
  app.use(m.errorHandler);
  return { app, db, m };
}

export const ALICE = { username: 'alice', email: 'alice@example.com', displayName: 'Alice', password: 'password123' };

export function setCookies(res: any): string[] {
  const sc = res.headers['set-cookie'];
  return Array.isArray(sc) ? sc : sc ? [sc] : [];
}
export function sidHeader(res: any): string | undefined {
  return setCookies(res).find((c) => c.startsWith('sid='));
}
export function sidValue(res: any): string {
  const h = sidHeader(res);
  if (!h) throw new Error('no sid Set-Cookie header; got: ' + JSON.stringify(setCookies(res)));
  return h.split(';')[0].slice(4);
}
export function attrs(header: string): string[] {
  return header.split(';').map((s) => s.trim().toLowerCase());
}
export function cookieHdr(sid: string) { return 'sid=' + sid; }

export async function signup(app: any, over: Record<string, unknown> = {}) {
  return request(app).post('/api/auth/signup').send({ ...ALICE, ...over });
}
/** signup and return the sid */
export async function signupSid(app: any, over: Record<string, unknown> = {}) {
  const res = await signup(app, over);
  if (res.status !== 201) throw new Error('signup failed ' + res.status + ' ' + JSON.stringify(res.body));
  return sidValue(res);
}
export function deepKeys(o: any, acc: string[] = []): string[] {
  if (Array.isArray(o)) o.forEach((x) => deepKeys(x, acc));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { acc.push(k); deepKeys(v, acc); }
  return acc;
}
export async function withEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return await fn(); } finally {
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}
export { request };
