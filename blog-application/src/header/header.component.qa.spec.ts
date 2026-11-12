import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { HeaderComponent } from './header.component';
import { AuthService } from '../core/auth.service';

describe('HeaderComponent (QA)', () => {
  let user: ReturnType<typeof signal<any>>;
  let auth: any;
  let router: Router;
  const alice = { id: 1, username: 'alice', email: 'a@x.io', displayName: 'Alice', bio: '', createdAt: '' };

  function make() {
    const f = TestBed.createComponent(HeaderComponent);
    f.detectChanges();
    return f;
  }
  const links = (f: any) => Array.from((f.nativeElement as HTMLElement).querySelectorAll('a')) as HTMLAnchorElement[];
  const link = (f: any, t: RegExp) => links(f).find((a) => t.test(a.textContent ?? ''));
  const btn = (f: any, t: RegExp) =>
    (Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')) as HTMLButtonElement[]).find((b) => t.test(b.textContent ?? ''));

  beforeEach(() => {
    user = signal<any>(null);
    auth = {
      currentUser: user, ready: Promise.resolve(), isOwner: () => false,
      logout: jasmine.createSpy('logout').and.callFake(async () => user.set(null)),
    };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
    router = TestBed.inject(Router);
  });

  it('logged out: Login and Signup only', () => {
    const f = make();
    expect(link(f, /log\s?in/i)?.getAttribute('href')).toBe('/login');
    expect(link(f, /sign\s?up/i)?.getAttribute('href')).toBe('/signup');
    expect(link(f, /write/i)).toBeUndefined();
    expect(link(f, /my posts/i)).toBeUndefined();
    expect(btn(f, /log\s?out/i)).toBeUndefined();
    expect(link(f, /log\s?out/i)).toBeUndefined();
  });
  it('logged in: Write, My posts, Profile, Logout; no Login/Signup', () => {
    user.set(alice);
    const f = make();
    expect(link(f, /write/i)?.getAttribute('href')).toBe('/me/posts/new');
    expect(link(f, /my posts/i)?.getAttribute('href')).toBe('/me/posts');
    expect(link(f, /profile/i)?.getAttribute('href')).toBe('/u/alice');
    expect(btn(f, /log\s?out/i)).toBeTruthy();
    expect(link(f, /^\s*log\s?in/i)).toBeUndefined();
    expect(link(f, /sign\s?up/i)).toBeUndefined();
  });
  it('logo and Home link to /', () => {
    const f = make();
    expect(link(f, /home/i)?.getAttribute('href')).toBe('/');
    expect(links(f).some((a) => a.getAttribute('href') === '/' && /weblog/i.test(a.textContent ?? ''))).toBeTrue();
  });
  it('Logout click calls AuthService.logout once and navigates to /', async () => {
    user.set(alice);
    const nav = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    const nav2 = spyOn(router, 'navigate').and.resolveTo(true);
    const f = make();
    btn(f, /log\s?out/i)!.click();
    await f.whenStable();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    const viaUrl = nav.calls.allArgs().some((a) => a[0] === '/');
    const viaArr = nav2.calls.allArgs().some((a) => Array.isArray(a[0]) && a[0][0] === '/' && a[0].length === 1);
    expect(viaUrl || viaArr).toBeTrue();
  });
  it('signal change updates DOM after detectChanges', () => {
    const f = make();
    expect(link(f, /sign\s?up/i)).toBeTruthy();
    user.set(alice);
    f.detectChanges();
    expect(link(f, /sign\s?up/i)).toBeUndefined();
    expect(link(f, /profile/i)).toBeTruthy();
    user.set(null);
    f.detectChanges();
    expect(link(f, /profile/i)).toBeUndefined();
  });
});
