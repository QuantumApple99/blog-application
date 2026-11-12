import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export function safeReturnUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  if (url.includes('\\') || /[\u0000-\u001f]/.test(url)) return null;
  return url;
}

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.currentUser()) return true;
  return router.parseUrl(`/login?returnUrl=${encodeURIComponent(state.url)}`);
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.currentUser() ? router.parseUrl('/me/posts') : true;
};
