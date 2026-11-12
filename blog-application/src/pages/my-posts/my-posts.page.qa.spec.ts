import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { Me, Page, PostSummary } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { MyPostsPage } from './my-posts.page';

const me: Me = { id: 1, username: 'ada', displayName: 'Ada', bio: '', email: 'a@x.io', createdAt: '2026-01-01T00:00:00Z' };
const mk = (n: number, status: 'draft' | 'published' = 'published'): PostSummary => ({
  id: n, slug: `p-${n}`, title: `Post ${n}`, excerpt: `Ex ${n}`, status,
  author: { username: 'ada', displayName: 'Ada' },
  createdAt: '2026-03-05T10:00:00Z', updatedAt: '2026-04-07T10:00:00Z',
  publishedAt: status === 'published' ? '2026-03-05T10:00:00Z' : null,
});
const pageOf = (items: PostSummary[], page = 1, totalPages = 1): Page<PostSummary> => ({ items, page, pageSize: 10, total: items.length, totalPages });

function setup(
  list: (p: number) => Observable<Page<PostSummary>>,
  opts: { deletePost?: (s: string) => Observable<void>; pageInput?: string } = {},
) {
  const api = {
    listMyPosts: jasmine.createSpy('listMyPosts').and.callFake((p: number = 1) => list(p)),
    deletePost: jasmine.createSpy('deletePost').and.callFake(opts.deletePost ?? (() => of(undefined))),
  } as jasmine.SpyObj<Pick<ApiService, 'listMyPosts' | 'deletePost'>>;
  const auth: Pick<AuthService, 'currentUser' | 'isOwner' | 'setUser'> = {
    currentUser: signal<Me | null>(me),
    isOwner: (n: string) => n === 'ada',
    setUser: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [MyPostsPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const urls: string[] = [];
  spyOn(router, 'navigate').and.callFake(async (cmds, extras) => { urls.push(router.createUrlTree(cmds, extras).toString()); return true; });
  spyOn(router, 'navigateByUrl').and.callFake(async (u) => { urls.push(u.toString()); return true; });
  const fixture = TestBed.createComponent(MyPostsPage);
  if (opts.pageInput !== undefined) fixture.componentRef.setInput('page', opts.pageInput);
  fixture.detectChanges();
  return { fixture, api, urls };
}
const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const settle = async (f: ComponentFixture<unknown>) => { await f.whenStable(); f.detectChanges(); };
const ROW = 'li, tr, article, app-post-card, [role="row"], [role="listitem"], .row, .card';
/** The row element that contains the given post title. */
function row(f: ComponentFixture<unknown>, title: string): HTMLElement | null {
  const nodes = Array.from(el(f).querySelectorAll<HTMLElement>('*')).filter(
    (n) => n.children.length === 0 && (n.textContent ?? '').trim() === title,
  );
  for (const n of nodes) {
    const r = n.closest<HTMLElement>(ROW);
    if (r) return r;
  }
  return null;
}
const inRow = (r: HTMLElement, tag: 'a' | 'button', re: RegExp) =>
  Array.from(r.querySelectorAll<HTMLElement>(tag)).find((x) => re.test(x.textContent ?? ''));

describe('MyPostsPage (QA)', () => {
  it('M1: listMyPosts(1) by default; rows show title, badge, updated date', async () => {
    const { fixture, api } = setup(() => of(pageOf([mk(1, 'draft'), mk(2, 'published')])));
    await settle(fixture);
    expect(api.listMyPosts).toHaveBeenCalledWith(1);
    const d = row(fixture, 'Post 1')!;
    const p = row(fixture, 'Post 2')!;
    expect(d).not.toBeNull();
    expect(p).not.toBeNull();
    expect(d.textContent).toMatch(/draft/i);
    expect(d.textContent).not.toMatch(/published/i);
    expect(p.textContent).toMatch(/published/i);
    expect(p.textContent).not.toMatch(/draft/i);
    expect(d.textContent).toMatch(/2026|Apr/);
  });

  it('M2: Edit link for all, View link only for published', async () => {
    const { fixture } = setup(() => of(pageOf([mk(1, 'draft'), mk(2, 'published')])));
    await settle(fixture);
    const d = row(fixture, 'Post 1')!;
    const p = row(fixture, 'Post 2')!;
    expect(inRow(d, 'a', /edit/i)?.getAttribute('href')).toBe('/me/posts/p-1/edit');
    expect(inRow(p, 'a', /edit/i)?.getAttribute('href')).toBe('/me/posts/p-2/edit');
    expect(inRow(d, 'a', /view/i)).toBeUndefined();
    expect(inRow(p, 'a', /view/i)?.getAttribute('href')).toBe('/posts/p-2');
  });

  function statefulList() {
    const deleted = new Set<string>();
    const all = [mk(1), mk(2)];
    const list = () => of(pageOf(all.filter((p) => !deleted.has(p.slug))));
    const deletePost = (s: string) => { deleted.add(s); return of(undefined) as Observable<void>; };
    return { list, deletePost };
  }

  it('M3: confirm=false makes no API call and row stays', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    const s = statefulList();
    const { fixture, api } = setup(s.list, { deletePost: s.deletePost });
    await settle(fixture);
    inRow(row(fixture, 'Post 1')!, 'button', /delete/i)!.click();
    await settle(fixture);
    expect(api.deletePost).not.toHaveBeenCalled();
    expect(row(fixture, 'Post 1')).not.toBeNull();
  });

  it('M3: confirm=true deletes once and the row disappears', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const s = statefulList();
    const { fixture, api } = setup(s.list, { deletePost: s.deletePost });
    await settle(fixture);
    inRow(row(fixture, 'Post 1')!, 'button', /delete/i)!.click();
    await settle(fixture);
    expect(api.deletePost).toHaveBeenCalledOnceWith('p-1');
    expect(row(fixture, 'Post 1')).toBeNull();
    expect(row(fixture, 'Post 2')).not.toBeNull();
  });

  it('M4: deleting the last row on page 2 navigates to page 1 or reloads', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    let gone = false;
    const { fixture, api, urls } = setup(
      (p) => (p === 2 ? of(pageOf(gone ? [] : [mk(11)], 2, gone ? 1 : 2)) : of(pageOf([mk(1)], 1, 1))),
      { deletePost: () => { gone = true; return of(undefined); }, pageInput: '2' },
    );
    await settle(fixture);
    expect(api.listMyPosts).toHaveBeenCalledWith(2);
    inRow(row(fixture, 'Post 11')!, 'button', /delete/i)!.click();
    await settle(fixture);
    expect(api.deletePost).toHaveBeenCalledWith('p-11');
    const reloadedPage1 = api.listMyPosts.calls.allArgs().some((a) => a[0] === 1);
    const navigated = urls.some((u) => u === '/me/posts' || /^\/me\/posts(\?page=1)?$/.test(u));
    expect(reloadedPage1 || navigated).withContext(`urls=${urls}`).toBeTrue();
    expect(row(fixture, 'Post 11')).toBeNull();
  });

  it('M4: deleting the last row on page 1 shows the empty state', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    let gone = false;
    const { fixture } = setup(() => of(pageOf(gone ? [] : [mk(1)], 1, gone ? 0 : 1)), {
      deletePost: () => { gone = true; return of(undefined); },
    });
    await settle(fixture);
    inRow(row(fixture, 'Post 1')!, 'button', /delete/i)!.click();
    await settle(fixture);
    expect(el(fixture).textContent).toContain('No posts yet');
  });

  it('M5: empty shows "No posts yet" and Write one link', async () => {
    const { fixture } = setup(() => of(pageOf([], 1, 0)));
    await settle(fixture);
    expect(el(fixture).textContent).toContain('No posts yet');
    const l = Array.from(el(fixture).querySelectorAll('a')).find((a) => /write one/i.test(a.textContent ?? ''));
    expect(l?.getAttribute('href')).toBe('/me/posts/new');
  });

  it('M6: error shows alert + Retry', async () => {
    let n = 0;
    const { fixture, api } = setup(() => (n++ === 0 ? throwError(() => new ApiError(500, 'INTERNAL', 'x')) : of(pageOf([mk(1)]))));
    await settle(fixture);
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    Array.from(el(fixture).querySelectorAll('button')).find((b) => /retry/i.test(b.textContent ?? ''))!.click();
    await settle(fixture);
    expect(api.listMyPosts).toHaveBeenCalledTimes(2);
    expect(row(fixture, 'Post 1')).not.toBeNull();
  });

  it('M6: pagination appears when totalPages>1', async () => {
    const { fixture } = setup(() => of(pageOf([mk(1)], 1, 3)));
    await settle(fixture);
    expect(el(fixture).querySelector('nav')).not.toBeNull();
  });

  it('M7: deletePost error keeps the row and shows an alert', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const { fixture } = setup(() => of(pageOf([mk(1)])), {
      deletePost: () => throwError(() => new ApiError(500, 'INTERNAL', 'cannot delete')),
    });
    await settle(fixture);
    inRow(row(fixture, 'Post 1')!, 'button', /delete/i)!.click();
    await settle(fixture);
    expect(row(fixture, 'Post 1')).not.toBeNull();
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
  });

  it('LAYOUT: no overflow at 375px; row controls >= 40px tall', async () => {
    if (!getComputedStyle(document.documentElement).getPropertyValue('--color-bg')) return pending('styles.css not loaded');
    const { fixture } = setup(() => of(pageOf([mk(1, 'draft'), mk(2)], 1, 2)));
    await settle(fixture);
    const host = el(fixture);
    host.style.cssText = 'display:block;width:375px';
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    const r = row(fixture, 'Post 1')!;
    const small = Array.from(r.querySelectorAll<HTMLElement>('a, button'))
      .filter((c) => c.offsetHeight < 40 && !/^Post \d+$/.test((c.textContent ?? '').trim()))
      .map((c) => c.outerHTML.slice(0, 60));
    expect(small).toEqual([]);
  });
});
