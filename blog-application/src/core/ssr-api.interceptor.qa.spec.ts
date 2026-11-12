import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ssrApiInterceptor } from './ssr-api.interceptor';
import { SSR_REQUEST } from '../ssr-request.token';

function setup(token?: { cookie: string; origin: string }) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([ssrApiInterceptor])),
      provideHttpClientTesting(),
      ...(token ? [{ provide: SSR_REQUEST, useValue: token }] : []),
    ],
  });
  return { http: TestBed.inject(HttpClient), ctl: TestBed.inject(HttpTestingController) };
}
const T = { cookie: 'sid=abc', origin: 'http://127.0.0.1:4000' };

describe('ssrApiInterceptor (QA)', () => {
  it('rewrites /api URL and sets Cookie', () => {
    const { http, ctl } = setup(T);
    http.get('/api/posts').subscribe();
    const r = ctl.expectOne('http://127.0.0.1:4000/api/posts');
    expect(r.request.headers.get('Cookie')).toBe('sid=abc');
    r.flush({}); ctl.verify();
  });
  it('empty cookie -> no Cookie header', () => {
    const { http, ctl } = setup({ cookie: '', origin: T.origin });
    http.get('/api/posts').subscribe();
    const r = ctl.expectOne('http://127.0.0.1:4000/api/posts');
    expect(r.request.headers.has('Cookie')).toBeFalse();
    r.flush({});
  });
  it('no token -> untouched', () => {
    const { http, ctl } = setup();
    http.get('/api/posts').subscribe();
    const r = ctl.expectOne('/api/posts');
    expect(r.request.headers.has('Cookie')).toBeFalse();
    r.flush({});
  });
  it('non-/api URL never rewritten', () => {
    const { http, ctl } = setup(T);
    http.get('/assets/x.json').subscribe();
    const r = ctl.expectOne('/assets/x.json');
    expect(r.request.headers.has('Cookie')).toBeFalse();
    r.flush({});
    http.get('https://other.example/img.png').subscribe();
    const f = ctl.expectOne('https://other.example/img.png');
    expect(f.request.headers.has('Cookie')).toBeFalse();
    f.flush({});
  });
  it('foreign-host /api URL is rewritten to SSR origin with Cookie (SSRF fix), query kept', () => {
    const { http, ctl } = setup(T);
    http.get('https://other.example/api/posts?page=2').subscribe();
    const r = ctl.expectOne('http://127.0.0.1:4000/api/posts?page=2');
    expect(r.request.headers.get('Cookie')).toBe('sid=abc');
    r.flush({});
    ctl.verify();
  });
  it('foreign-host /api URL untouched when no SSR_REQUEST', () => {
    const { http, ctl } = setup();
    http.get('https://other.example/api/posts').subscribe();
    ctl.expectOne('https://other.example/api/posts').flush({});
  });
});
