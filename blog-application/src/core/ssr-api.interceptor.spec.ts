import { HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { SSR_REQUEST } from '../ssr-request.token';
import { ssrApiInterceptor } from './ssr-api.interceptor';

describe('ssrApiInterceptor (smoke)', () => {
  function run(url: string): HttpRequest<unknown> {
    TestBed.configureTestingModule({
      providers: [{ provide: SSR_REQUEST, useValue: { cookie: 'sid=abc', origin: 'http://127.0.0.1:4000' } }],
    });
    let seen!: HttpRequest<unknown>;
    TestBed.runInInjectionContext(() =>
      ssrApiInterceptor(new HttpRequest('GET', url), (r) => ((seen = r), null as never)),
    );
    return seen;
  }

  it('rewrites a foreign-host /api URL to the internal origin with the cookie', () => {
    const r = run('http://evil.example:4313/api/posts?page=2');
    expect(r.url).toBe('http://127.0.0.1:4000/api/posts?page=2');
    expect(r.headers.get('Cookie')).toBe('sid=abc');
  });

  it('leaves a foreign-host non-/api URL untouched and without cookie', () => {
    const r = run('https://other.example/assets/x.json');
    expect(r.url).toBe('https://other.example/assets/x.json');
    expect(r.headers.has('Cookie')).toBeFalse();
  });
});
