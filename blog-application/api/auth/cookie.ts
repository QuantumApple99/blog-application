import type { Response, CookieOptions } from 'express';

export const COOKIE_NAME = 'sid';
const MAX_AGE_SECONDS = 2592000;

function secure(): boolean {
  return process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false';
}

export function setSessionCookie(res: Response, sid: string): void {
  res.cookie(COOKIE_NAME, sid, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS * 1000,
    secure: secure(),
  });
}

export function clearSessionCookie(res: Response): void {
  // Same Path/flags as set (maxAge omitted: clearCookie sets expiry in the past).
  const opts: CookieOptions = { httpOnly: true, sameSite: 'lax', path: '/', secure: secure() };
  res.clearCookie(COOKIE_NAME, opts);
}
