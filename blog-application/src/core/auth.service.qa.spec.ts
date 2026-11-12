import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { ApiError } from './api.service';

const me = (u: string) => ({ id: 1, username: u, email: u + '@x.io', displayName: u, bio: '', createdAt: '' });
const pending = async (p: Promise<unknown>) => {
  const S = Symbol();
  return (await Promise.race([p, new Promise((r) => setTimeout(() => r(S), 20))])) === S;
};

describe('AuthService (QA)', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('before load: user null, ready pending', async () => {
    expect(auth.currentUser()).toBeNull();
    expect(await pending(auth.ready)).toBeTrue();
  });
  it('load with user sets user and resolves ready', async () => {
    const p = auth.load();
    http.expectOne('/api/auth/me').flush({ user: me('alice') });
    await p;
    await auth.ready;
    expect(auth.currentUser()?.username).toBe('alice');
  });
  it('load with null user -> null, ready resolves', async () => {
    const p = auth.load();
    http.expectOne('/api/auth/me').flush({ user: null });
    await p;
    await auth.ready;
    expect(auth.currentUser()).toBeNull();
  });
  it('load with erroring me() -> null, ready resolves, no reject', async () => {
    const p = auth.load();
    http.expectOne('/api/auth/me').flush('x', { status: 500, statusText: 'e' });
    await expectAsync(p).toBeResolved();
    await expectAsync(auth.ready).toBeResolved();
    expect(auth.currentUser()).toBeNull();
  });
  it('login success sets user and resolves Me', async () => {
    const p = auth.login({ username: 'alice', password: 'pw' } as any);
    http.expectOne('/api/auth/login').flush({ user: me('alice') });
    expect((await p as any).username).toBe('alice');
    expect(auth.currentUser()?.username).toBe('alice');
  });
  it('signup success sets user and resolves Me', async () => {
    const p = auth.signup({ username: 'bob', email: 'b@x.io', displayName: 'B', password: 'password1' } as any);
    http.expectOne('/api/auth/signup').flush({ user: me('bob') }, { status: 201, statusText: 'Created' });
    expect((await p as any).username).toBe('bob');
    expect(auth.currentUser()?.username).toBe('bob');
  });
  it('login failure rejects ApiError, user unchanged', async () => {
    auth.setUser(me('keep') as any);
    const p = auth.login({ username: 'a', password: 'b' } as any);
    http.expectOne('/api/auth/login').flush(
      { error: { code: 'INVALID_CREDENTIALS', message: 'm' } }, { status: 401, statusText: 'U' });
    const e = await p.catch((x) => x);
    expect(e instanceof ApiError).toBeTrue();
    expect(auth.currentUser()?.username).toBe('keep');
  });
  it('signup failure rejects ApiError, user unchanged', async () => {
    const p = auth.signup({} as any);
    http.expectOne('/api/auth/signup').flush(
      { error: { code: 'USERNAME_TAKEN', message: 'm' } }, { status: 409, statusText: 'C' });
    const e = await p.catch((x) => x);
    expect(e instanceof ApiError).toBeTrue();
    expect(auth.currentUser()).toBeNull();
  });
  it('logout nulls user', async () => {
    auth.setUser(me('alice') as any);
    const p = auth.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await p;
    expect(auth.currentUser()).toBeNull();
  });
  it('logout nulls user even if API errors', async () => {
    auth.setUser(me('alice') as any);
    const p = auth.logout();
    http.expectOne('/api/auth/logout').flush('x', { status: 500, statusText: 'e' });
    await p.catch(() => undefined);
    expect(auth.currentUser()).toBeNull();
  });
  it('setUser replaces', () => {
    auth.setUser(me('a') as any);
    auth.setUser(me('b') as any);
    expect(auth.currentUser()?.username).toBe('b');
    auth.setUser(null as any);
    expect(auth.currentUser()).toBeNull();
  });
  it('isOwner only for matching logged-in username', () => {
    expect(auth.isOwner('alice')).toBeFalse();
    auth.setUser(me('alice') as any);
    expect(auth.isOwner('alice')).toBeTrue();
    expect(auth.isOwner('bob')).toBeFalse();
  });
});
