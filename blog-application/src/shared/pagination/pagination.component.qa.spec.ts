import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaginationComponent } from './pagination.component';

function render(page: number, totalPages: number) {
  TestBed.configureTestingModule({ imports: [PaginationComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PaginationComponent);
  fixture.componentRef.setInput('page', page);
  fixture.componentRef.setInput('totalPages', totalPages);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const link = (re: RegExp) =>
    Array.from(host.querySelectorAll('a')).find((a) => re.test(a.textContent ?? '') || re.test(a.getAttribute('aria-label') ?? ''));
  return { host, link };
}

describe('PaginationComponent (QA)', () => {
  it('C2: page 1 of 1 renders nothing', () => {
    const { host } = render(1, 1);
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('nav')).toBeNull();
    expect((host.textContent ?? '').trim()).toBe('');
  });

  it('C2: page 2 of 3 has Previous page=1, Next page=3 and "Page 2 of 3" text', () => {
    const { host, link } = render(2, 3);
    expect(link(/prev/i)?.getAttribute('href')).toMatch(/[?&]page=1(&|$)/);
    expect(link(/next/i)?.getAttribute('href')).toMatch(/[?&]page=3(&|$)/);
    expect(host.textContent).toMatch(/page\s*2\s*of\s*3/i);
  });

  it('C2: page 1 of 3 has no Previous', () => {
    const { link } = render(1, 3);
    expect(link(/prev/i)).toBeUndefined();
    expect(link(/next/i)).toBeDefined();
  });

  it('C2: page 3 of 3 has no Next', () => {
    const { link } = render(3, 3);
    expect(link(/next/i)).toBeUndefined();
    expect(link(/prev/i)).toBeDefined();
  });
});
