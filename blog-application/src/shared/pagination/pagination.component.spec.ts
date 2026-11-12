import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PaginationComponent } from './pagination.component';

function make(page: number, totalPages: number) {
  TestBed.configureTestingModule({ imports: [PaginationComponent], providers: [provideRouter([])] });
  const f = TestBed.createComponent(PaginationComponent);
  f.componentRef.setInput('page', page);
  f.componentRef.setInput('totalPages', totalPages);
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('PaginationComponent (smoke)', () => {
  it('renders nothing when totalPages <= 1', () => {
    expect(make(1, 1).querySelector('nav')).toBeNull();
  });
  it('renders prev/next and label', () => {
    const el = make(2, 3);
    expect(el.querySelector('nav')?.getAttribute('aria-label')).toBe('Pagination');
    const links = Array.from(el.querySelectorAll('a'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Previous', 'Next']);
    expect(links[0].getAttribute('href')).toContain('page=1');
    expect(links[1].getAttribute('href')).toContain('page=3');
    expect(el.textContent).toContain('Page 2 of 3');
  });
});

import { parsePageParam } from './pagination.component';

describe('parsePageParam (smoke)', () => {
  it('handles junk, huge and normal values', () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam('abc')).toBe(1);
    expect(parsePageParam('-3')).toBe(1);
    expect(parsePageParam('0')).toBe(1);
    expect(parsePageParam('3')).toBe(3);
    expect(parsePageParam('99999999999999999999')).toBe(1_000_000);
  });
});
