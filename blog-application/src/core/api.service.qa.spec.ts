import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { isObservable } from 'rxjs';
import { ApiService, ApiError } from './api.service';

const run = (x: any): Promise<any> =>
  new Promise((res, rej) => {
    if (isObservable(x)) x.subscribe({ next: (v) => res(v), error: rej, complete: () => res(undefined) });
    else Promise.resolve(x).then(res, rej);
  });

describe('ApiService (QA)', () => {
  let api: ApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('me() returns user', async () => {
    const p = run(api.me());
    const r = http.expectOne('/api/auth/me');
    expect(r.request.method).toBe('GET');
    r.flush({ user: { id: 1, username: 'alice' } });
    expect((await p).username).toBe('alice');
  });
  it('me() returns null when logged out', async () => {
    const p = run(api.me());
    http.expectOne('/api/auth/me').flush({ user: null });
    expect(await p).toBeNull();
  });
  it('login POSTs credentials and unwraps user', async () => {
    const p = run(api.login({ username: 'a', password: 'p' } as any));
    const r = http.expectOne('/api/auth/login');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual({ username: 'a', password: 'p' });
    r.flush({ user: { username: 'a' } });
    expect((await p).username).toBe('a');
  });
  it('signup POSTs and unwraps user', async () => {
    const body = { username: 'abc', email: 'a@b.c', displayName: 'A', password: 'password1' };
    const p = run(api.signup(body as any));
    const r = http.expectOne('/api/auth/signup');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual(body);
    r.flush({ user: { username: 'abc' } }, { status: 201, statusText: 'Created' });
    expect((await p).username).toBe('abc');
  });
  it('logout POSTs and completes on 204', async () => {
    const p = run(api.logout());
    const r = http.expectOne('/api/auth/logout');
    expect(r.request.method).toBe('POST');
    r.flush(null, { status: 204, statusText: 'No Content' });
    await expectAsync(p).toBeResolved();
  });
  it('getPost unwraps post', async () => {
    const p = run(api.getPost('hello'));
    const r = http.expectOne('/api/posts/hello');
    expect(r.request.method).toBe('GET');
    r.flush({ post: { slug: 'hello' } });
    expect((await p).slug).toBe('hello');
  });
  it('getPost URL-encodes special characters', async () => {
    const slug = 'a b/ü?x';
    const p = run(api.getPost(slug));
    const r = http.expectOne((q) => q.url.startsWith('/api/posts/'));
    expect(r.request.url).toBe('/api/posts/' + encodeURIComponent(slug));
    r.flush({ post: { slug } });
    await p;
  });
  it('listPosts(2) requests page=2', async () => {
    const p = run(api.listPosts(2));
    const r = http.expectOne((q) => q.url === '/api/posts');
    expect(r.request.urlWithParams).toBe('/api/posts?page=2');
    r.flush({ items: [], page: 2, pageSize: 10, total: 0, totalPages: 0 });
    expect((await p).page).toBe(2);
  });
  it('listMyPosts(1,"draft") sends status=draft', async () => {
    const p = run(api.listMyPosts(1, 'draft'));
    const r = http.expectOne((q) => q.url === '/api/me/posts');
    expect(r.request.params.get('status')).toBe('draft');
    expect(r.request.params.get('page')).toBe('1');
    r.flush({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    await p;
  });
  it('listMyPosts(1) sends no status param', async () => {
    const p = run(api.listMyPosts(1));
    const r = http.expectOne((q) => q.url === '/api/me/posts');
    expect(r.request.params.has('status')).toBeFalse();
    r.flush({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 });
    await p;
  });
  it('createPost POST /api/posts', async () => {
    const input = { title: 't', body: 'b', status: 'draft' };
    const p = run(api.createPost(input as any));
    const r = http.expectOne('/api/posts');
    expect(r.request.method).toBe('POST');
    expect(r.request.body).toEqual(input);
    r.flush({ post: { slug: 't' } }, { status: 201, statusText: 'Created' });
    expect((await p).slug).toBe('t');
  });
  it('updatePost PATCH /api/posts/<slug>', async () => {
    const p = run(api.updatePost('t', { title: 'n' } as any));
    const r = http.expectOne('/api/posts/t');
    expect(r.request.method).toBe('PATCH');
    r.flush({ post: { slug: 't' } });
    await p;
  });
  it('deletePost DELETE /api/posts/<slug>', async () => {
    const p = run(api.deletePost('t'));
    const r = http.expectOne('/api/posts/t');
    expect(r.request.method).toBe('DELETE');
    r.flush(null, { status: 204, statusText: 'No Content' });
    await expectAsync(p).toBeResolved();
  });

  describe('errors', () => {
    it('400 VALIDATION maps to ApiError with fields', async () => {
      const p = run(api.login({ username: '', password: '' } as any));
      http.expectOne('/api/auth/login').flush(
        { error: { code: 'VALIDATION', message: 'bad', fields: { title: 'x' } } },
        { status: 400, statusText: 'Bad Request' });
      const e = await p.catch((x) => x);
      expect(e instanceof ApiError).toBeTrue();
      expect(e.status).toBe(400);
      expect(e.code).toBe('VALIDATION');
      expect(e.fields.title).toBe('x');
    });
    it('401 takes code from body', async () => {
      const p = run(api.login({ username: 'a', password: 'b' } as any));
      http.expectOne('/api/auth/login').flush(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } },
        { status: 401, statusText: 'Unauthorized' });
      const e = await p.catch((x) => x);
      expect(e.status).toBe(401);
      expect(e.code).toBe('INVALID_CREDENTIALS');
    });
    it('404 has status 404', async () => {
      const p = run(api.getPost('nope'));
      http.expectOne('/api/posts/nope').flush(
        { error: { code: 'NOT_FOUND', message: 'nf' } }, { status: 404, statusText: 'Not Found' });
      const e = await p.catch((x) => x);
      expect(e instanceof ApiError).toBeTrue();
      expect(e.status).toBe(404);
    });
    it('network error maps to ApiError with generic message', async () => {
      const p = run(api.getPost('x'));
      http.expectOne('/api/posts/x').error(new ProgressEvent('error'));
      const e = await p.catch((x) => x);
      expect(e instanceof ApiError).toBeTrue();
      expect(typeof e.message).toBe('string');
      expect(e.message.length).toBeGreaterThan(0);
      expect(e.name).not.toBe('HttpErrorResponse');
    });
    it('non-JSON 500 maps to ApiError with generic message', async () => {
      const p = run(api.getPost('x'));
      http.expectOne('/api/posts/x').flush('<html>boom</html>', { status: 500, statusText: 'ISE' });
      const e = await p.catch((x) => x);
      expect(e instanceof ApiError).toBeTrue();
      expect(e.status).toBe(500);
      expect(e.message).not.toContain('<html>');
      expect(e.message.length).toBeGreaterThan(0);
    });
  });
});
