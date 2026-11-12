import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundViewComponent } from './not-found.page';

describe('NotFoundViewComponent (QA)', () => {
  it('shows "not found" and a link to /', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(NotFoundViewComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent!.toLowerCase()).toContain('not found');
    expect(Array.from(el.querySelectorAll('a')).some((a) => a.getAttribute('href') === '/')).toBeTrue();
  });
});
