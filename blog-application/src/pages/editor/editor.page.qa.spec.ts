import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { Me, Post } from '../../core/api.models';
import { AuthService } from '../../core/auth.service';
import { EditorPage } from './editor.page';

const me: Me = { id: 1, username: 'ada', displayName: 'Ada', bio: '', email: 'a@x.io', createdAt: '2026-01-01T00:00:00Z' };
const mkPost = (over: Partial<Post> = {}): Post => ({
  id: 1, slug: 'my-post', title: 'Existing title', excerpt: 'e', status: 'draft',
  author: { username: 'ada', displayName: 'Ada' },
  createdAt: '2026-03-05T10:00:00Z', updatedAt: '2026-03-05T10:00:00Z', publishedAt: null,
  body: 'Existing body', html: '<p>Existing body</p>', ...over,
});

interface Opts {
  slug?: string;
  getPost?: () => Observable<Post>;
  createPost?: () => Observable<Post>;
  updatePost?: () => Observable<Post>;
  deletePost?: () => Observable<void>;
  owner?: boolean;
}
function setup(o: Opts = {}) {
  const api = {
    getPost: jasmine.createSpy('getPost').and.callFake(o.getPost ?? (() => of(mkPost()))),
    createPost: jasmine.createSpy('createPost').and.callFake(o.createPost ?? (() => of(mkPost({ slug: 'new-slug' })))),
    updatePost: jasmine.createSpy('updatePost').and.callFake(o.updatePost ?? (() => of(mkPost()))),
    deletePost: jasmine.createSpy('deletePost').and.callFake(o.deletePost ?? (() => of(undefined))),
  } as jasmine.SpyObj<Pick<ApiService, 'getPost' | 'createPost' | 'updatePost' | 'deletePost'>>;
  const auth: Pick<AuthService, 'currentUser' | 'isOwner' | 'setUser'> = {
    currentUser: signal<Me | null>(me),
    isOwner: () => o.owner ?? true,
    setUser: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [EditorPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const urls: string[] = [];
  spyOn(router, 'navigate').and.callFake(async (cmds, extras) => { urls.push(router.createUrlTree(cmds, extras).toString()); return true; });
  spyOn(router, 'navigateByUrl').and.callFake(async (u) => { urls.push(u.toString()); return true; });
  const fixture = TestBed.createComponent(EditorPage);
  if (o.slug) fixture.componentRef.setInput('slug', o.slug);
  fixture.detectChanges();
  return { fixture, api, urls };
}
const el = (f: ComponentFixture<unknown>) => f.nativeElement as HTMLElement;
const settle = async (f: ComponentFixture<unknown>) => { await f.whenStable(); f.detectChanges(); };
type Ctl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
function field(f: ComponentFixture<unknown>, re: RegExp, sel = 'input, textarea, select'): Ctl | null {
  const root = el(f);
  for (const c of Array.from(root.querySelectorAll<Ctl>(sel))) {
    const lab = c.id ? root.querySelector(`label[for="${c.id}"]`)?.textContent ?? '' : '';
    const wrap = c.closest('label')?.textContent ?? '';
    const names = [c.getAttribute('aria-label'), c.getAttribute('formControlName'), c.getAttribute('name'), c.id, lab, wrap].join(' ');
    if (re.test(names)) return c;
  }
  return null;
}
const titleCtl = (f: ComponentFixture<unknown>) => field(f, /title/i, 'input, textarea') as HTMLInputElement;
const bodyCtl = (f: ComponentFixture<unknown>) => field(f, /body|content/i, 'textarea') as HTMLTextAreaElement;
function type(c: Ctl, v: string) {
  c.value = v;
  c.dispatchEvent(new Event('input', { bubbles: true }));
  c.dispatchEvent(new Event('change', { bubbles: true }));
}
/** Set status via select, radio, or a checkbox labelled "publish". */
function setStatus(f: ComponentFixture<unknown>, status: 'draft' | 'published') {
  const root = el(f);
  const sel = root.querySelector<HTMLSelectElement>('select');
  if (sel) { type(sel, status); return; }
  const radio = root.querySelector<HTMLInputElement>(`input[type="radio"][value="${status}"]`);
  if (radio) { radio.click(); return; }
  const cb = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (cb) { if (cb.checked !== (status === 'published')) cb.click(); return; }
  throw new Error('no status control found');
}
function statusValue(f: ComponentFixture<unknown>): string | undefined {
  const root = el(f);
  const sel = root.querySelector<HTMLSelectElement>('select');
  if (sel) return sel.value;
  const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  if (radios.length) return radios.find((r) => r.checked)?.value;
  const cb = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
  return cb ? (cb.checked ? 'published' : 'draft') : undefined;
}
const submitBtn = (f: ComponentFixture<unknown>) =>
  (el(f).querySelector('form button[type="submit"]') ??
    Array.from(el(f).querySelectorAll('button')).find((b) => /save|publish|create/i.test(b.textContent ?? ''))) as HTMLButtonElement | null;
const deleteBtn = (f: ComponentFixture<unknown>) =>
  Array.from(el(f).querySelectorAll('button')).find((b) => /delete/i.test(b.textContent ?? ''));
async function fillAndSubmit(f: ComponentFixture<unknown>, title: string, body: string, status?: 'draft' | 'published') {
  type(titleCtl(f), title);
  type(bodyCtl(f), body);
  if (status) setStatus(f, status);
  f.detectChanges();
  el(f).querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle(f);
}
const clickSubmit = async (f: ComponentFixture<unknown>) => { submitBtn(f)!.click(); await settle(f); };

describe('EditorPage (QA)', () => {
  it('E1: create mode has title, body, status (default draft); getPost not called', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    expect(titleCtl(fixture)).not.toBeNull();
    expect(bodyCtl(fixture)).not.toBeNull();
    expect(statusValue(fixture)).toBe('draft');
    expect(api.getPost).not.toHaveBeenCalled();
  });

  it('E1: saving a published post calls createPost and navigates to /posts/<slug>', async () => {
    const { fixture, api, urls } = setup({ createPost: () => of(mkPost({ slug: 'new-slug', status: 'published' })) });
    await settle(fixture);
    await fillAndSubmit(fixture, 'Hello', 'World', 'published');
    expect(api.createPost).toHaveBeenCalledOnceWith({ title: 'Hello', body: 'World', status: 'published' });
    expect(urls).toContain('/posts/new-slug');
    expect(api.getPost).not.toHaveBeenCalled();
  });

  it('E1: saving a draft (default status) navigates to /me/posts', async () => {
    const { fixture, api, urls } = setup({ createPost: () => of(mkPost({ slug: 'd', status: 'draft' })) });
    await settle(fixture);
    await fillAndSubmit(fixture, 'Hello', 'World');
    expect(api.createPost).toHaveBeenCalledOnceWith({ title: 'Hello', body: 'World', status: 'draft' });
    expect(urls).toContain('/me/posts');
  });

  it('E2: edit mode loads post by slug and prefills the form', async () => {
    const { fixture, api } = setup({ slug: 'my-post' });
    await settle(fixture);
    expect(api.getPost).toHaveBeenCalledWith('my-post');
    expect(titleCtl(fixture).value).toBe('Existing title');
    expect(bodyCtl(fixture).value).toBe('Existing body');
    expect(statusValue(fixture)).toBe('draft');
  });

  it('E2: saving calls updatePost with the same slug', async () => {
    const { fixture, api } = setup({ slug: 'my-post' });
    await settle(fixture);
    await fillAndSubmit(fixture, 'Changed', 'New body', 'published');
    expect(api.updatePost).toHaveBeenCalledOnceWith('my-post', { title: 'Changed', body: 'New body', status: 'published' });
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it('E3: edit mode with getPost 404 shows not-found and no form', async () => {
    const { fixture } = setup({ slug: 'my-post', getPost: () => throwError(() => new ApiError(404, 'NOT_FOUND', 'nope')) });
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/not found/i);
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('E3: edit mode when not the owner shows not-found and no form', async () => {
    const { fixture } = setup({ slug: 'my-post', owner: false });
    await settle(fixture);
    expect(el(fixture).textContent).toMatch(/not found/i);
    expect(el(fixture).querySelector('form')).toBeNull();
  });

  it('E4: empty title blocks submit, no call', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    await fillAndSubmit(fixture, '', 'body');
    await clickSubmit(fixture);
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it('E4: title over 200 chars is invalid (no call)', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    await fillAndSubmit(fixture, 'a'.repeat(201), 'body');
    expect(api.createPost).not.toHaveBeenCalled();
    expect(titleCtl(fixture).classList.contains('ng-invalid') || titleCtl(fixture).getAttribute('aria-invalid') === 'true').toBeTrue();
  });

  it('E4: title of exactly 200 chars is accepted', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    await fillAndSubmit(fixture, 'a'.repeat(200), 'body');
    expect(api.createPost).toHaveBeenCalledTimes(1);
  });

  it('E4: body over 100000 chars is invalid (no call)', async () => {
    const { fixture, api } = setup();
    await settle(fixture);
    await fillAndSubmit(fixture, 'ok', 'b'.repeat(100001));
    expect(api.createPost).not.toHaveBeenCalled();
  });

  it('E5: 400 fields.title shows message, page stays, submit re-enabled', async () => {
    const { fixture } = setup({
      createPost: () => throwError(() => new ApiError(400, 'VALIDATION', 'bad', { title: 'Title is required' })),
    });
    await settle(fixture);
    await fillAndSubmit(fixture, 'x', 'y');
    expect(el(fixture).textContent).toContain('Title is required');
    expect(el(fixture).querySelector('form')).not.toBeNull();
    expect(submitBtn(fixture)!.disabled).toBeFalse();
  });

  it('E6: submit disabled while pending, re-enabled after error', async () => {
    const s = new Subject<Post>();
    const { fixture } = setup({ createPost: () => s });
    await settle(fixture);
    await fillAndSubmit(fixture, 'x', 'y');
    expect(submitBtn(fixture)!.disabled).toBeTrue();
    s.error(new ApiError(500, 'INTERNAL', 'boom'));
    await settle(fixture);
    expect(submitBtn(fixture)!.disabled).toBeFalse();
  });

  it('E7: 401 navigates to /login?returnUrl=', async () => {
    const { fixture, urls } = setup({ createPost: () => throwError(() => new ApiError(401, 'UNAUTHENTICATED', 'no')) });
    await settle(fixture);
    await fillAndSubmit(fixture, 'x', 'y');
    expect(urls.some((u) => u.startsWith('/login?returnUrl='))).withContext(`urls=${urls}`).toBeTrue();
  });

  it('E7: 500 shows alert banner and keeps the form values', async () => {
    const { fixture } = setup({ createPost: () => throwError(() => new ApiError(500, 'INTERNAL', 'boom')) });
    await settle(fixture);
    await fillAndSubmit(fixture, 'keep me', 'y');
    expect(el(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(titleCtl(fixture).value).toBe('keep me');
  });

  it('E8: Delete exists in edit mode but not in create mode', async () => {
    const e = setup({ slug: 'my-post' });
    await settle(e.fixture);
    expect(deleteBtn(e.fixture)).toBeDefined();
    TestBed.resetTestingModule();
    const c = setup();
    await settle(c.fixture);
    expect(deleteBtn(c.fixture)).toBeUndefined();
  });

  it('E8: confirm=false makes no call', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    const { fixture, api } = setup({ slug: 'my-post' });
    await settle(fixture);
    deleteBtn(fixture)!.click();
    await settle(fixture);
    expect(api.deletePost).not.toHaveBeenCalled();
  });

  it('E8: confirm=true deletes my-post and navigates to /me/posts', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const { fixture, api, urls } = setup({ slug: 'my-post' });
    await settle(fixture);
    deleteBtn(fixture)!.click();
    await settle(fixture);
    expect(api.deletePost).toHaveBeenCalledOnceWith('my-post');
    expect(urls).toContain('/me/posts');
  });

  it('E9: body is a plain textarea and nothing renders a preview', async () => {
    const { fixture } = setup();
    await settle(fixture);
    expect(bodyCtl(fixture).tagName).toBe('TEXTAREA');
    type(bodyCtl(fixture), '**bold** <b>html</b>');
    fixture.detectChanges();
    expect(el(fixture).querySelector('strong, b, [class*="preview"]')).toBeNull();
  });

  it('LAYOUT: no overflow at 375px; all form controls >= 40px tall', async () => {
    if (!getComputedStyle(document.documentElement).getPropertyValue('--color-bg')) return pending('styles.css not loaded');
    const { fixture } = setup({ slug: 'my-post' });
    await settle(fixture);
    const host = el(fixture);
    host.style.cssText = 'display:block;width:375px';
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    const small = Array.from(host.querySelectorAll<HTMLElement>('input, textarea, select, button'))
      .filter((c) => (c as HTMLInputElement).type !== 'radio' && (c as HTMLInputElement).type !== 'checkbox' && c.offsetHeight < 40)
      .map((c) => c.outerHTML.slice(0, 60));
    expect(small).toEqual([]);
  });
});
