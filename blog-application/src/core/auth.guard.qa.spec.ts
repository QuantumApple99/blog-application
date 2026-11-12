import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { isObservable, firstValueFrom } from 'rxjs';
import { signal } from '@angular/core';
import { authGuard, guestGuard, safeReturnUrl } from './auth.guard';
import { AuthService } from './auth.service';

describe('guards (QA)', () => {
  let user: ReturnType<typeof signal<any>>;
  let resolveReady: () => void;
  let ready: Promise<void>;
  let router: Router;

  const call = (g: any, url: string) =>
    TestBed.runInInjectionContext(() => g({} as any, { url } as any));
  const settle = async (r: any) => (isObservable(r) ? firstValueFrom(r) : await r);
  const ser = (t: any) => router.serializeUrl(t as UrlTree);

  function setup(u: any, deferred = false) {
    user = signal(u);
    ready = deferred ? new Promise<void>((r) => (resolveReady = r)) : Promise.resolve();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { currentUser: user, ready, isOwner: () => false } }],
    });
    router = TestBed.inject(Router);
  }

  it('authGuard logged out -> /login?returnUrl=%2Fme%2Fposts', async () => {
    setup(null);
    const r = await settle(call(authGuard, '/me/posts'));
    expect(r instanceof UrlTree).toBeTrue();
    expect(ser(r)).toBe('/login?returnUrl=%2Fme%2Fposts');
  });
  it('authGuard logged in -> true', async () => {
    setup({ username: 'alice' });
    expect(await settle(call(authGuard, '/me/posts'))).toBeTrue();
  });
  it('guestGuard logged in -> /me/posts', async () => {
    setup({ username: 'alice' });
    const r = await settle(call(guestGuard, '/login'));
    expect(r instanceof UrlTree).toBeTrue();
    expect(ser(r)).toBe('/me/posts');
  });
  it('guestGuard logged out -> true', async () => {
    setup(null);
    expect(await settle(call(guestGuard, '/login'))).toBeTrue();
  });
  for (const [name, g] of [['authGuard', authGuard], ['guestGuard', guestGuard]] as const) {
    it(`${name} waits for ready (no early answer)`, async () => {
      setup(null, true);
      let answered = false;
      const p = settle(call(g, '/me/posts')).then((v) => { answered = true; return v; });
      await new Promise((r) => setTimeout(r, 20));
      expect(answered).toBeFalse();
      resolveReady();
      await p;
      expect(answered).toBeTrue();
    });
  }

  describe('safeReturnUrl', () => {
    it('keeps same-origin path', () => expect(safeReturnUrl('/me/posts')).toBe('/me/posts'));
    for (const bad of ['//evil.com', 'https://evil.com', 'evil', '/\\evil.com', undefined]) {
      it(`rejects ${String(bad)}`, () => expect(safeReturnUrl(bad as any)).toBeNull());
    }
  });
});
