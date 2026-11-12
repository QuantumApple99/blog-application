import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';
import { AppComponent } from './app.component';
import { authGuard, guestGuard } from '../core/auth.guard';
import { AuthService } from '../core/auth.service';

const byPath = (p: string) => routes.find((r) => r.path === p)!;

describe('routes (QA)', () => {
  const expected = ['', 'posts/:slug', 'u/:username', 'me/posts', 'me/posts/new', 'me/posts/:slug/edit', 'login', 'signup', '**'];
  it('contains all expected paths', () => {
    for (const p of expected) expect(byPath(p)).withContext(p).toBeDefined();
  });
  it("'**' is last", () => expect(routes[routes.length - 1].path).toBe('**'));
  it("'me/posts/new' precedes 'me/posts/:slug/edit'", () => {
    const paths = routes.map((r) => r.path);
    expect(paths.indexOf('me/posts/new')).toBeLessThan(paths.indexOf('me/posts/:slug/edit'));
  });
  it('all use loadComponent and have a title', () => {
    for (const p of expected) {
      expect(byPath(p).loadComponent).withContext(p + ' loadComponent').toBeDefined();
      expect(byPath(p).title).withContext(p + ' title').toBeTruthy();
    }
  });
  it('me/* include authGuard', () => {
    for (const p of ['me/posts', 'me/posts/new', 'me/posts/:slug/edit']) expect(byPath(p).canActivate).withContext(p).toContain(authGuard);
  });
  it('login/signup include guestGuard', () => {
    for (const p of ['login', 'signup']) expect(byPath(p).canActivate).withContext(p).toContain(guestGuard);
  });
  it('unknown URL renders NotFound', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: signal(null), ready: Promise.resolve(), isOwner: () => false, logout: async () => {} } }],
    });
    const h = await RouterTestingHarness.create();
    await h.navigateByUrl('/definitely/not/a/page');
    h.detectChanges();
    expect((h.routeNativeElement as HTMLElement).textContent!.toLowerCase()).toContain('not found');
  });
});

describe('AppComponent (QA)', () => {
  it('renders app-header and router-outlet', () => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: signal(null), ready: Promise.resolve(), isOwner: () => false, logout: async () => {} } }],
    });
    const f = TestBed.createComponent(AppComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-header')).toBeTruthy();
    expect(el.querySelector('router-outlet')).toBeTruthy();
  });
});
