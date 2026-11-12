import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { Me, Page, PostSummary } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { FeedPage } from './feed.page';

const post = (n: number, over: Partial<PostSummary> = {}): PostSummary => ({
  id: n,
  slug: `post-${n}`,
  title: `Title ${n}`,
  excerpt: `Excerpt number ${n}`,
  status: 'published',
  author: { username: `user${n}`, displayName: `Author ${n}` },
  createdAt: '2026-03-05T10:00:00Z',
  updatedAt: '2026-03-05T10:00:00Z',
  publishedAt: '2026-03-05T10:00:00Z',
  ...over,
});
const pageOf = (items: PostSummary[], page = 1, totalPages = 1): Page<PostSummary> => ({
  items,
  page,
  pageSize: 10,
  total: items.length,
  totalPages,
});
const me: Me = { id: 1, username: 'me', displayName: 'Me', bio: '', email: 'm@x.io', createdAt: '2026-01-01T00:00:00Z' };

type Api = Pick<ApiService, 'listPosts'>;

function setup(listPosts: (p?: number) => Observable<Page<PostSummary>>, user: Me | null = null, pageInput?: string) {
  const api = { listPosts: jasmine.createSpy('listPosts').and.callFake(listPosts) } as jasmine.SpyObj<Api>;
  const auth: Pick<AuthService, 'currentUser' | 'isOwner' | 'setUser'> = {
    currentUser: signal(user),
    isOwner: (u: string) => user?.username === u,
    setUser: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [FeedPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(FeedPage);
  if (pageInput !== undefined) fixture.componentRef.setInput('page', pageInput);
  fixture.detectChanges();
  return { fixture, api };
}
const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const links = (f: ComponentFixture<unknown>) => Array.from(el(f).querySelectorAll('a'));
const cards = (f: ComponentFixture<unknown>) => el(f).querySelectorAll('app-post-card');

describe('FeedPage (QA)', () => {
  it('F1: loading shows role=status and no cards', async () => {
    const { fixture } = setup(() => new Subject<Page<PostSummary>>());
    await fixture.whenStable();
    expect(el(fixture).querySelector('[role="status"]')).not.toBeNull();
    expect(cards(fixture).length).toBe(0);
  });

  it('F2: two items render two cards with title/excerpt/author/date', async () => {
    const { fixture } = setup(() => of(pageOf([post(1), post(2)])));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cards(fixture).length).toBe(2);
    const c = cards(fixture)[0] as HTMLElement;
    const a = (sel: string) => c.querySelector(sel) as HTMLAnchorElement | null;
    expect(a('a[href="/posts/post-1"]')?.textContent).toContain('Title 1');
    expect(c.textContent).toContain('Excerpt number 1');
    expect(a('a[href="/u/user1"]')?.textContent).toContain('Author 1');
    expect(c.textContent).toMatch(/2026|Mar/);
  });

  it('F3: empty + logged in shows "Write one" link', async () => {
    const { fixture } = setup(() => of(pageOf([], 1, 0)), me);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('No posts yet');
    const l = links(fixture).find((x) => /write one/i.test(x.textContent ?? ''));
    expect(l?.getAttribute('href')).toBe('/me/posts/new');
  });

  it('F3: empty + logged out shows "Sign up" link', async () => {
    const { fixture } = setup(() => of(pageOf([], 1, 0)), null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('No posts yet');
    const l = links(fixture).find((x) => /sign up/i.test(x.textContent ?? ''));
    expect(l?.getAttribute('href')).toBe('/signup');
    expect(links(fixture).some((x) => /write one/i.test(x.textContent ?? ''))).toBeFalse();
  });

  it('F4: error shows alert + Retry which reloads and shows cards', async () => {
    let n = 0;
    const { fixture, api } = setup(() =>
      n++ === 0 ? throwError(() => new ApiError(500, 'INTERNAL', 'boom')) : of(pageOf([post(1), post(2)])),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    const retry = Array.from(el(fixture).querySelectorAll('button')).find((b) => /retry/i.test(b.textContent ?? ''));
    expect(retry).toBeDefined();
    retry!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.listPosts).toHaveBeenCalledTimes(2);
    expect(cards(fixture).length).toBe(2);
    expect(el(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  for (const [input, expected] of [['2', 2], [undefined, 1], ['abc', 1], ['0', 1]] as [string | undefined, number][]) {
    it(`F5: page input ${JSON.stringify(input)} calls listPosts(${expected})`, async () => {
      const { fixture, api } = setup(() => of(pageOf([post(1)])), null, input);
      await fixture.whenStable();
      expect(api.listPosts).toHaveBeenCalledWith(expected);
    });
  }

  const nav = (f: ComponentFixture<unknown>) => el(f).querySelector('nav');
  const byText = (f: ComponentFixture<unknown>, re: RegExp) =>
    links(f).find((x) => re.test(x.textContent ?? '') || re.test(x.getAttribute('aria-label') ?? ''));

  it('F6: page 2 of 3 has Previous page=1 and Next page=3', async () => {
    const { fixture } = setup(() => of(pageOf([post(1)], 2, 3)), null, '2');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byText(fixture, /prev/i)?.getAttribute('href')).toMatch(/[?&]page=1(&|$)/);
    expect(byText(fixture, /next/i)?.getAttribute('href')).toMatch(/[?&]page=3(&|$)/);
  });

  it('F6: page 1 has no Previous', async () => {
    const { fixture } = setup(() => of(pageOf([post(1)], 1, 3)), null, '1');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byText(fixture, /prev/i)).toBeUndefined();
    expect(byText(fixture, /next/i)).toBeDefined();
  });

  it('F6: last page has no Next', async () => {
    const { fixture } = setup(() => of(pageOf([post(1)], 3, 3)), null, '3');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byText(fixture, /next/i)).toBeUndefined();
    expect(byText(fixture, /prev/i)).toBeDefined();
  });

  it('F6: totalPages<=1 renders no pagination nav', async () => {
    const { fixture } = setup(() => of(pageOf([post(1)], 1, 1)));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(nav(fixture)).toBeNull();
  });

  it('F7: page beyond the end shows empty state with link to page 1', async () => {
    const { fixture } = setup(() => of(pageOf([], 5, 2)), null, '5');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(cards(fixture).length).toBe(0);
    expect(el(fixture).textContent).toMatch(/no posts/i);
    expect(links(fixture).some((a) => ['/', '/?page=1'].includes(a.getAttribute('href') ?? ''))).toBeTrue();
  });

  it('F8: document title is "WeBlog" after loading', async () => {
    const { fixture } = setup(() => of(pageOf([post(1)])));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(Title).getTitle()).toBe('WeBlog');
  });

  it('LAYOUT: no horizontal overflow at 375px', async () => {
    if (!getComputedStyle(document.documentElement).getPropertyValue('--color-bg')) return pending('styles.css not loaded');
    const { fixture } = setup(() => of(pageOf([post(1), post(2)], 1, 2)));
    await fixture.whenStable();
    fixture.detectChanges();
    const host = el(fixture);
    host.style.cssText = 'display:block;width:375px;overflow:visible';
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
  });
});
