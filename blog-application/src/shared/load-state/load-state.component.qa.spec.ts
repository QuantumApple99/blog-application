import { Component } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoadStateComponent } from './load-state.component';

// ASSUMED inputs: state, errorMessage, emptyMessage, emptyActionLabel, emptyActionLink; output: retry
@Component({
  standalone: true,
  imports: [LoadStateComponent],
  template: `<app-load-state [state]="state" [errorMessage]="errorMessage" [emptyMessage]="emptyMessage"
      [emptyActionLabel]="label" [emptyActionLink]="href" (retry)="retries = retries + 1"><p class="content">CONTENT</p></app-load-state>`,
})
class Host {
  state: any = 'loading';
  errorMessage = 'Boom happened';
  emptyMessage = 'Nothing here';
  label: string | undefined;
  href: string | undefined;
  retries = 0;
}

describe('LoadStateComponent (QA)', () => {
  let f: ComponentFixture<Host>;
  const el = () => f.nativeElement as HTMLElement;
  const set = (p: Partial<Host>) => { Object.assign(f.componentInstance, p); f.changeDetectorRef.markForCheck(); f.detectChanges(); };
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideRouter([])] });
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('loading: Loading text, role=status, content hidden', () => {
    expect(el().textContent).toContain('Loading');
    expect(el().querySelector('[role=status]')).toBeTruthy();
    expect(el().querySelector('.content')).toBeNull();
  });
  it('error: role=alert, message, Retry emits once', () => {
    set({ state: 'error' });
    expect(el().querySelector('[role=alert]')).toBeTruthy();
    expect(el().textContent).toContain('Boom happened');
    expect(el().querySelector('.content')).toBeNull();
    const btn = Array.from(el().querySelectorAll('button')).find((b) => /retry/i.test(b.textContent ?? ''))!;
    expect(btn).toBeTruthy();
    btn.click();
    expect(f.componentInstance.retries).toBe(1);
  });
  it('empty: message, no link by default', () => {
    set({ state: 'empty' });
    expect(el().textContent).toContain('Nothing here');
    expect(el().querySelector('a')).toBeNull();
    expect(el().querySelector('.content')).toBeNull();
  });
  it('empty: link only when label and href both given', () => {
    set({ state: 'empty', label: 'Write one' });
    expect(el().querySelector('a')).toBeNull();
    set({ label: undefined, href: '/me/posts/new' });
    expect(el().querySelector('a')).toBeNull();
    set({ label: 'Write one', href: '/me/posts/new' });
    const a = el().querySelector('a')!;
    expect(a).toBeTruthy();
    expect(a.textContent).toContain('Write one');
    expect(a.getAttribute('href')).toBe('/me/posts/new');
  });
  it('ready: only projected content', () => {
    set({ state: 'ready' });
    expect(el().querySelector('.content')?.textContent).toBe('CONTENT');
    expect(el().querySelector('[role=status]')).toBeNull();
    expect(el().querySelector('[role=alert]')).toBeNull();
    expect(el().textContent).not.toContain('Loading');
  });
});
