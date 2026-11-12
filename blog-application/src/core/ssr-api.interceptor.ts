import { HttpBackend, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { FetchBackend } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SSR_REQUEST, SsrRequest } from '../ssr-request.token';

function rewrite(req: HttpRequest<unknown>, ssr: SsrRequest | null): HttpRequest<unknown> {
  if (!ssr) return req;
  let path = req.url;
  // platform-server resolves relative URLs against the client's Host header, so the host is untrusted:
  // reduce any URL to its path and always send /api/* to the internal origin.
  if (!path.startsWith('/')) {
    try {
      const u = new URL(path);
      path = u.pathname + u.search;
    } catch {
      return req;
    }
  }
  if (!path.startsWith('/api/')) return req;
  const url = ssr.origin + path;
  return ssr.cookie ? req.clone({ url, setHeaders: { Cookie: ssr.cookie } }) : req.clone({ url });
}

/** Interceptor form (not registered in the chain: it would run before the transfer cache and change its keys). */
export const ssrApiInterceptor: HttpInterceptorFn = (req, next: HttpHandlerFn) =>
  next(rewrite(req, inject(SSR_REQUEST, { optional: true })));

/**
 * Server-only HttpBackend wrapper (provided in app.config.server.ts). Runs after the interceptor chain
 * (incl. the transfer cache), so cache keys keep the relative '/api/...' URL and match the browser's.
 */
@Injectable()
export class SsrApiBackend implements HttpBackend {
  private readonly inner = inject(FetchBackend);
  private readonly ssr = inject(SSR_REQUEST, { optional: true });

  handle(req: HttpRequest<any>): Observable<HttpEvent<any>> {
    return this.inner.handle(rewrite(req, this.ssr));
  }
}
