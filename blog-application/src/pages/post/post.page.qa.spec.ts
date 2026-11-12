import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { Me, Post } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { PostPage } from './post.page';

const mkPost = (over: Partial<Post> = {}): Post => ({
  id: 1,
  slug: 'my-post',
  title: 'My Post',
  excerpt: 'ex',
  status: 'published',
  author: { username: 'ada', displayName: 'Ada Lovelace' },
  createdAt: '2026-03-05T10:00:00Z',
  updatedAt: '2026-03-05T10:00:00Z',
  publishedAt: '2026-03-05T10:00:00Z',
  body: '**raw-body-marker**',
  html: '<p>Hello <strong>bold</strong></p>',
  ...over,
});
const user = (username: string): Me => ({ id: 1, username, displayName: username, bio: '', email: 'e@x.io', createdAt: '2026-01-01T00:00:00Z' });

function setup(getPost: () => Observable<Post>, u: Me | null = null, deletePost: () => Observable<void> = () => of(undefined)) {
  const api = {
    getPost: jasmine.createSpy('getPost').and.callFake(getPost),
    deletePost: jasmine.createSpy('deletePost').and.callFake(deletePost),
  } as jasmine.SpyObj<Pick<ApiService, 'getPost' | 'deletePost'>>;
  const auth: Pick<AuthService, 'currentUser' | 'isOwner' | 'setUser'> = {
    currentUser: signal(u),
    isOwner: (n: string) => u?.username === n,
    setUser: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [PostPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const urls: string[] = [];
  spyOn(router, 'navigate').and.callFake(async (cmds, extras) => {
    urls.push(router.createUrlTree(cmds, extras).toString());
    return true;
  });
  spyOn(router, 'navigateByUrl').and.callFake(async (u) => {
    urls.push(u.toString());
    return true;
  });
  const fixture = TestBed.createComponent(PostPage);
  fixture.componentRef.setInput('slug', 'my-post');
  fixture.detectChanges();
  return { fixture, api, urls };
}
const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const settle = async (f: ComponentFixture<unknown>) => {
  await f.whenStable();
  f.detectChanges();
};
const btn = (f: ComponentFixture<unknown>, re: RegExp) =>
  Array.from(el(f).querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''));
const link = (f: ComponentFixture<unknown>, re: RegExp) =>
  Array.from(el(f).querySelectorAll('a')).find((a) => re.test(a.textContent ?? ''));

describe('PostPage (QA)', () => {
  it('P1: calls getPost(slug) and shows title, author link and date', async () => {
    const { fixture, api } = setup(() => of(mkPost()));
    await settle(fixture);
    expect(api.getPost).toHaveBeenCalledWith('my-post');
    expect(el(fixture).textContent).toContain('My Post');
    expect(el(fixture).querySelector('a[href="/u/ada"]')?.textContent).toContain('Ada Lovelace');
    expect(el(fixture).textContent).toMatch(/2026|Mar/);
  });

  it('P2: html is rendered as DOM and raw body is not shown', async () => {
    const { fixture } = setup(() => of(mkPost()));
    await settle(fixture);
    const strong = el(fixture).querySelector('strong');
    expect(strong?.textContent).toBe('bold');
    expect(el(fixture).textContent).not.toContain('raw-body-marker');
  });

  it('P3: scripts and event handlers are stripped', async () => {
    (window as unknown as { __pwned?: number }).__pwned = undefined;
    const { fixture } = setup(() =>
      of(mkPost({ html: '<p>ok</p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">' })),
    );
    await settle(fixture);
    await new Promise((r) => setTimeout(r, 50));
    expect(el(fixture).textContent).toContain('ok');
    expect(el(fixture).querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(el(fixture).querySelector('[onerror]')).toBeNull();
  });

  it('P4: Draft badge for drafts only', async () => {
    const d = setup(() => of(mkPost({ status: 'draft', publishedAt: null })));
    await settle(d.fixture);
    expect(el(d.fixture).textContent).toMatch(/draft/i);
    TestBed.resetTestingModule();
    const p = setup(() => of(mkPost()));
    await settle(p.fixture);
    expect(el(p.fixture).textContent).not.toMatch(/draft/i);
  });

  it('P5: owner sees Edit link and Delete button', async () => {
    const { fixture } = setup(() => of(mkPost()), user('ada'));
    await settle(fixture);
    expect(link(fixture, /edit/i)?.getAttribute('href')).toBe('/me/posts/my-post/edit');
    expect(btn(fixture, /delete/i)).toBeDefined();
  });

  it('P5: logged out sees neither Edit nor Delete', async () => {
    const { fixture } = setup(() => of(mkPost()), null);
    await settle(fixture);
    expect(link(fixture, /edit/i)).toBeUndefined();
    expect(btn(fixture, /delete/i)).toBeUndefined();
  });

  it('P5: another user sees neither Edit nor Delete', async () => {
    const { fixture } = setup(() => of(mkPost()), user('bob'));
    await settle(fixture);
    expect(link(fixture, /edit/i)).toBeUndefined();
    expect(btn(fixture, /delete/i)).toBeUndefined();
  });

  it('P6: confirm=false does not delete', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    const { fixture, api, urls } = setup(() => of(mkPost()), user('ada'));
    await settle(fixture);
    btn(fixture, /delete/i)!.click();
    await settle(fixture);
    expect(api.deletePost).not.toHaveBeenCalled();
    expect(urls).toEqual([]);
  });

  it('P6: confirm=true deletes then navigates to /me/posts', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const { fixture, api, urls } = setup(() => of(mkPost()), user('ada'));
    await settle(fixture);
    btn(fixture, /delete/i)!.click();
    await settle(fixture);
    expect(api.deletePost).toHaveBeenCalledWith('my-post');
    expect(urls).toContain('/me/posts');
  });

  it('P7: 404 shows not-found in place, no Retry, title "Not found · WeBlog"', async () => {
    const { fixture } = setup(() => throwError(() => new ApiError(404, 'NOT_FOUND', 'Post not found')));
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/not found/i);
    expect(btn(fixture, /retry/i)).toBeUndefined();
    expect(TestBed.inject(Title).getTitle()).toBe('Not found · WeBlog');
  });

  it('P7: 500 shows role=alert with Retry', async () => {
    const { fixture } = setup(() => throwError(() => new ApiError(500, 'INTERNAL', 'boom')));
    await settle(fixture);
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(btn(fixture, /retry/i)).toBeDefined();
  });

  it('P8: title is "<post title> · WeBlog"', async () => {
    const { fixture } = setup(() => of(mkPost()));
    await settle(fixture);
    expect(TestBed.inject(Title).getTitle()).toBe('My Post · WeBlog');
  });

  it('LAYOUT: no horizontal overflow at 375px (long unbroken html)', async () => {
    if (!getComputedStyle(document.documentElement).getPropertyValue('--color-bg')) return pending('styles.css not loaded');
    const { fixture } = setup(() => of(mkPost({ html: '<p>' + 'word '.repeat(80) + '</p><pre>' + 'x'.repeat(200) + '</pre>' })), user('ada'));
    await settle(fixture);
    const host = el(fixture);
    host.style.cssText = 'display:block;width:375px';
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });
});
