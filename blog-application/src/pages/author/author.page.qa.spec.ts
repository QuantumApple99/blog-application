import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { Me, Page, PostSummary, PublicUser } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { AuthorPage } from './author.page';

const pub: PublicUser = { username: 'ada', displayName: 'Ada Lovelace', bio: 'Math person', createdAt: '2026-01-01T00:00:00Z' };
const me: Me = { ...pub, id: 1, email: 'ada@x.io' };
const post = (n: number): PostSummary => ({
  id: n, slug: `p-${n}`, title: `Post ${n}`, excerpt: `Ex ${n}`, status: 'published',
  author: { username: 'ada', displayName: 'Ada Lovelace' },
  createdAt: '2026-03-05T10:00:00Z', updatedAt: '2026-03-05T10:00:00Z', publishedAt: '2026-03-05T10:00:00Z',
});
const pageOf = (items: PostSummary[], totalPages = 1): Page<PostSummary> => ({ items, page: 1, pageSize: 10, total: items.length, totalPages });

interface Opts {
  getUser?: () => Observable<PublicUser>;
  getUserPosts?: () => Observable<Page<PostSummary>>;
  updateMe?: (i: { displayName?: string; bio?: string }) => Observable<Me>;
  user?: Me | null;
}
function setup(o: Opts = {}) {
  const api = {
    getUser: jasmine.createSpy('getUser').and.callFake(o.getUser ?? (() => of(pub))),
    getUserPosts: jasmine.createSpy('getUserPosts').and.callFake(o.getUserPosts ?? (() => of(pageOf([post(1), post(2)])))),
    updateMe: jasmine.createSpy('updateMe').and.callFake(o.updateMe ?? ((i: { displayName?: string; bio?: string }) => of({ ...me, ...i }))),
  } as jasmine.SpyObj<Pick<ApiService, 'getUser' | 'getUserPosts' | 'updateMe'>>;
  const u: WritableSignal<Me | null> = signal(o.user ?? null);
  const auth = {
    currentUser: u,
    isOwner: (n: string) => u()?.username === n,
    setUser: jasmine.createSpy('setUser').and.callFake((m: Me) => u.set(m)),
  } as unknown as jasmine.SpyObj<Pick<AuthService, "currentUser" | "isOwner" | "setUser">>;
  TestBed.configureTestingModule({
    imports: [AuthorPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
  });
  const fixture = TestBed.createComponent(AuthorPage);
  fixture.componentRef.setInput('username', 'ada');
  fixture.detectChanges();
  return { fixture, api, auth };
}
const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const settle = async (f: ComponentFixture<unknown>) => { await f.whenStable(); f.detectChanges(); };
const btn = (f: ComponentFixture<unknown>, re: RegExp) =>
  Array.from(el(f).querySelectorAll('button')).find((b) => re.test(b.textContent ?? ''));
/** Find a form control by aria-label, label text, formControlName, name or id. */
function field(f: ComponentFixture<unknown>, re: RegExp): HTMLInputElement | HTMLTextAreaElement | null {
  const root = el(f);
  const ctrls = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
  for (const c of ctrls) {
    const lab = c.id ? root.querySelector(`label[for="${c.id}"]`)?.textContent ?? '' : '';
    const wrap = c.closest('label')?.textContent ?? '';
    const names = [c.getAttribute('aria-label'), c.getAttribute('formControlName'), c.name, c.id, lab, wrap].join(' ');
    if (re.test(names)) return c;
  }
  return null;
}
function type(c: HTMLInputElement | HTMLTextAreaElement, v: string) {
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
}
const submitBtn = (f: ComponentFixture<unknown>) =>
  (el(f).querySelector('form button[type="submit"]') ?? btn(f, /save/i)) as HTMLButtonElement | null;
const submitForm = (f: ComponentFixture<unknown>) =>
  el(f).querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
async function openForm(f: ComponentFixture<unknown>) {
  btn(f, /edit profile/i)!.click();
  await settle(f);
}

describe('AuthorPage (QA)', () => {
  it('A1: loads user + posts, shows name, bio, cards, pagination, title', async () => {
    const { fixture, api } = setup({ getUserPosts: () => of(pageOf([post(1), post(2)], 2)) });
    await settle(fixture);
    expect(api.getUser).toHaveBeenCalledWith('ada');
    expect(api.getUserPosts).toHaveBeenCalledWith('ada', 1);
    expect(el(fixture).textContent).toContain('Ada Lovelace');
    expect(el(fixture).textContent).toContain('Math person');
    expect(el(fixture).querySelectorAll('app-post-card').length).toBe(2);
    expect(el(fixture).querySelector('nav')).not.toBeNull();
    expect(TestBed.inject(Title).getTitle()).toBe('Ada Lovelace · WeBlog');
  });

  it('A1: no pagination when totalPages is 1', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(el(fixture).querySelector('nav')).toBeNull();
  });

  it('A2: 404 from getUser shows not-found', async () => {
    const { fixture } = setup({ getUser: () => throwError(() => new ApiError(404, 'NOT_FOUND', 'nope')) });
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/not found/i);
  });

  it('A2: 404 from getUserPosts shows not-found', async () => {
    const { fixture } = setup({ getUserPosts: () => throwError(() => new ApiError(404, 'NOT_FOUND', 'nope')) });
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/not found/i);
  });

  it('A3: logged out has no Edit profile button or form', async () => {
    const { fixture } = setup({ user: null });
    await settle(fixture);
    expect(btn(fixture, /edit profile/i)).toBeUndefined();
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('A3: another user has no Edit profile button or form', async () => {
    const { fixture } = setup({ user: { ...me, username: 'bob' } });
    await settle(fixture);
    expect(btn(fixture, /edit profile/i)).toBeUndefined();
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('A4: Edit profile opens a prefilled form', async () => {
    const { fixture } = setup({ user: me });
    await settle(fixture);
    expect(el(fixture).querySelector('form')).toBeNull();
    await openForm(fixture);
    expect(field(fixture, /display/i)?.value).toBe('Ada Lovelace');
    expect(field(fixture, /bio/i)?.value).toBe('Math person');
  });

  it('A4: submitting calls updateMe with exact values, then setUser, name updates', async () => {
    const { fixture, api, auth } = setup({ user: me });
    await settle(fixture);
    await openForm(fixture);
    type(field(fixture, /display/i)!, 'Countess Ada');
    type(field(fixture, /bio/i)!, 'New bio');
    fixture.detectChanges();
    submitBtn(fixture)!.click();
    await settle(fixture);
    expect(api.updateMe).toHaveBeenCalledOnceWith({ displayName: 'Countess Ada', bio: 'New bio' });
    expect(auth.setUser).toHaveBeenCalledWith(jasmine.objectContaining({ displayName: 'Countess Ada', bio: 'New bio' }));
    expect(el(fixture).textContent).toContain('Countess Ada');
  });

  it('A5: empty displayName makes no updateMe call', async () => {
    const { fixture, api } = setup({ user: me });
    await settle(fixture);
    await openForm(fixture);
    type(field(fixture, /display/i)!, '');
    fixture.detectChanges();
    submitForm(fixture);
    submitBtn(fixture)?.click();
    await settle(fixture);
    expect(api.updateMe).not.toHaveBeenCalled();
  });

  it('A5: submit is disabled while pending', async () => {
    const pending$ = new Subject<Me>();
    const { fixture, api } = setup({ user: me, updateMe: () => pending$ });
    await settle(fixture);
    await openForm(fixture);
    type(field(fixture, /display/i)!, 'Changed');
    fixture.detectChanges();
    submitBtn(fixture)!.click();
    await settle(fixture);
    expect(api.updateMe).toHaveBeenCalledTimes(1);
    expect(submitBtn(fixture)!.disabled).toBeTrue();
  });

  it('A6: 400 with fields shows message and keeps form open', async () => {
    const { fixture } = setup({
      user: me,
      updateMe: () => throwError(() => new ApiError(400, 'VALIDATION', 'bad', { displayName: 'Too long' })),
    });
    await settle(fixture);
    await openForm(fixture);
    type(field(fixture, /display/i)!, 'x');
    fixture.detectChanges();
    submitBtn(fixture)!.click();
    await settle(fixture);
    const form = el(fixture).querySelector('form');
    expect(form).not.toBeNull();
    expect(form!.textContent).toContain('Too long');
    expect(field(fixture, /display/i)).not.toBeNull();
  });

  it('A7: empty list shows a "no published posts" message, not an error', async () => {
    const { fixture } = setup({ getUserPosts: () => of(pageOf([], 0)) });
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/no published posts/i);
    expect(el(fixture).querySelector('[role="alert"]')).toBeNull();
  });

  it('LAYOUT: no overflow at 375px and form controls >= 40px tall', async () => {
    if (!getComputedStyle(document.documentElement).getPropertyValue('--color-bg')) return pending('styles.css not loaded');
    const { fixture } = setup({ user: me });
    await settle(fixture);
    const host = el(fixture);
    host.style.cssText = 'display:block;width:375px';
    await openForm(fixture);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    const small = Array.from(host.querySelectorAll<HTMLElement>('form input, form textarea, form button, form select'))
      .filter((c) => c.offsetHeight < 40).map((c) => c.outerHTML.slice(0, 60));
    expect(small).toEqual([]);
  });
});
