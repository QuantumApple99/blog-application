import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { SignupPage } from './signup.page';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api.service';

@Component({ template: 'dummy', standalone: true }) class Dummy {}

const apiErr = (status: number, error: any) => toApiError(new HttpErrorResponse({ status, statusText: 'x', error }));
const input = (root: HTMLElement, name: string) =>
  root.querySelector(`input[name="${name}"], input[formcontrolname="${name}"], input#${name}`) as HTMLInputElement;
const type = (i: HTMLInputElement, v: string) => { i.value = v; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); };
const VALID = { username: 'alice_1', email: 'alice@example.com', displayName: 'Alice', password: 'password1' };

describe('SignupPage (QA)', () => {
  let auth: any;
  let router: Router;
  let harness: RouterTestingHarness;
  let root: HTMLElement;

  async function open(url = '/signup') {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, SignupPage);
    root = harness.routeNativeElement as HTMLElement;
  }
  const fill = (o: Partial<typeof VALID> = {}) => {
    const v = { ...VALID, ...o };
    for (const k of Object.keys(v)) type(input(root, k), (v as any)[k]);
    harness.detectChanges();
  };
  const submit = async () => {
    (root.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();
  };

  beforeEach(() => {
    auth = { currentUser: () => null, ready: Promise.resolve(), signup: jasmine.createSpy('signup').and.resolveTo({ username: 'alice_1' }) };
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'signup', component: SignupPage }, { path: '**', component: Dummy }], withComponentInputBinding()), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
  });

  const invalid: [string, Partial<typeof VALID>][] = [
    ['username "ab"', { username: 'ab' }],
    ['username "Bad Name"', { username: 'Bad Name' }],
    ['username of 21 chars', { username: 'a'.repeat(21) }],
    ['email without @', { email: 'nope.example.com' }],
    ['password of 7 chars', { password: '1234567' }],
    ['empty displayName', { displayName: '' }],
    ['displayName of 51 chars', { displayName: 'x'.repeat(51) }],
  ];
  for (const [name, o] of invalid) {
    it(`rejects ${name} (no API call)`, async () => {
      await open(); fill(o); await submit();
      expect(auth.signup).not.toHaveBeenCalled();
    });
  }
  it('accepts valid input and redirects to /me/posts', async () => {
    await open(); fill(); await submit();
    expect(auth.signup).toHaveBeenCalledTimes(1);
    expect(router.url).toBe('/me/posts');
  });
  it('accepts boundary values (3/20 username, 8 password, 50 displayName)', async () => {
    await open(); fill({ username: 'a'.repeat(20), displayName: 'x'.repeat(50), password: '12345678' }); await submit();
    expect(auth.signup).toHaveBeenCalledTimes(1);
  });
  it('USERNAME_TAKEN shown under username', async () => {
    auth.signup.and.rejectWith(apiErr(409, { error: { code: 'USERNAME_TAKEN', message: 'Username already taken' } }));
    await open(); fill(); await submit();
    expect(root.textContent).toContain('Username already taken');
    expect(router.url).not.toBe('/me/posts');
  });
  it('EMAIL_TAKEN shown under email', async () => {
    auth.signup.and.rejectWith(apiErr(409, { error: { code: 'EMAIL_TAKEN', message: 'Email already registered' } }));
    await open(); fill(); await submit();
    expect(root.textContent).toContain('Email already registered');
  });
  it('VALIDATION fields shown under inputs', async () => {
    auth.signup.and.rejectWith(apiErr(400, { error: { code: 'VALIDATION', message: 'bad', fields: { displayName: 'Display bad', password: 'Pass bad' } } }));
    await open(); fill(); await submit();
    expect(root.textContent).toContain('Display bad');
    expect(root.textContent).toContain('Pass bad');
  });
  it('submit disabled while pending', async () => {
    let res!: (v: any) => void;
    auth.signup.and.returnValue(new Promise((r) => (res = r)));
    await open(); fill(); await submit();
    expect((root.querySelector('button[type=submit], form button') as HTMLButtonElement).disabled).toBeTrue();
    res({ username: 'alice_1' });
    await harness.fixture.whenStable();
  });
  it('honours safe returnUrl', async () => {
    await open('/signup?returnUrl=%2Fposts%2Fhello'); fill(); await submit();
    expect(router.url).toBe('/posts/hello');
  });
  it('rejects unsafe returnUrl', async () => {
    await open('/signup?returnUrl=%2F%2Fevil.com'); fill(); await submit();
    expect(router.url).toBe('/me/posts');
  });
});
