import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { LoginPage } from './login.page';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api.service';

@Component({ template: 'dummy', standalone: true }) class Dummy {}

const apiErr = (status: number, error: any) =>
  toApiError(new HttpErrorResponse({ status, statusText: 'x', error }));
const input = (root: HTMLElement, name: string) =>
  root.querySelector(`input[name="${name}"], input[formcontrolname="${name}"], input#${name}`) as HTMLInputElement;
const type = (i: HTMLInputElement, v: string) => { i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };

describe('LoginPage (QA)', () => {
  let auth: any;
  let router: Router;
  let harness: RouterTestingHarness;
  let root: HTMLElement;
  let resolveLogin: (v: any) => void;

  async function open(url = '/login') {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, LoginPage);
    root = harness.routeNativeElement as HTMLElement;
  }
  const fill = (u = 'alice', p = 'password1') => {
    type(input(root, 'username'), u); type(input(root, 'password'), p); harness.detectChanges();
  };
  const submit = async () => {
    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();
  };

  beforeEach(() => {
    auth = { currentUser: () => null, ready: Promise.resolve(), login: jasmine.createSpy('login').and.resolveTo({ username: 'alice' }) };
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'login', component: LoginPage }, { path: '**', component: Dummy }], withComponentInputBinding()), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  it('empty submit makes no API call', async () => {
    await open(); await submit();
    expect(auth.login).not.toHaveBeenCalled();
  });
  it('submit button disabled while pending', async () => {
    auth.login.and.returnValue(new Promise((r) => (resolveLogin = r)));
    await open(); fill(); await submit();
    const b = root.querySelector('button[type=submit], form button') as HTMLButtonElement;
    expect(b.disabled).toBeTrue();
    resolveLogin({ username: 'alice' });
    await harness.fixture.whenStable(); harness.detectChanges();
  });
  it('401 shows exactly "Invalid username or password"', async () => {
    auth.login.and.rejectWith(apiErr(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } }));
    await open(); fill(); await submit();
    expect(root.textContent).toContain('Invalid username or password');
    expect(root.textContent).not.toContain('INVALID_CREDENTIALS');
  });
  it('400 field errors shown', async () => {
    auth.login.and.rejectWith(apiErr(400, { error: { code: 'VALIDATION', message: 'bad', fields: { username: 'Username is wrong', password: 'Password is wrong' } } }));
    await open(); fill(); await submit();
    expect(root.textContent).toContain('Username is wrong');
    expect(root.textContent).toContain('Password is wrong');
  });
  it('success -> /me/posts', async () => {
    await open(); fill(); await submit();
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/me/posts');
  });
  it('success with returnUrl=/posts/hello -> /posts/hello', async () => {
    await open('/login?returnUrl=%2Fposts%2Fhello'); fill(); await submit();
    expect(router.url).toBe('/posts/hello');
  });
  it('unsafe returnUrl=//evil.com -> /me/posts', async () => {
    await open('/login?returnUrl=%2F%2Fevil.com'); fill(); await submit();
    expect(router.url).toBe('/me/posts');
  });
  it('email-shaped username passes client validation', async () => {
    await open(); fill('alice@example.com', 'password1'); await submit();
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(auth.login.calls.mostRecent().args[0].username ?? auth.login.calls.mostRecent().args[0]).toBe('alice@example.com');
  });
});
