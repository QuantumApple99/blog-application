import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../core/api.service';
import { FeedPage } from './feed.page';

function setup(listPosts: jasmine.Spy) {
  TestBed.configureTestingModule({
    imports: [FeedPage],
    providers: [provideRouter([]), { provide: ApiService, useValue: { listPosts } }],
  });
  const f = TestBed.createComponent(FeedPage);
  f.detectChanges();
  return f;
}

describe('FeedPage (smoke)', () => {
  it('ready', () => {
    const post = { id: 1, slug: 's', title: 'T1', excerpt: 'e', status: 'published', author: { username: 'a', displayName: 'A' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', publishedAt: null };
    const f = setup(jasmine.createSpy().and.returnValue(of({ items: [post], page: 1, pageSize: 10, total: 1, totalPages: 1 })));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('T1');
  });
  it('empty', () => {
    const f = setup(jasmine.createSpy().and.returnValue(of({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 })));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('No posts yet.');
  });
  it('error', () => {
    const f = setup(jasmine.createSpy().and.returnValue(throwError(() => new ApiError(500, 'INTERNAL', 'Boom'))));
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Boom');
  });
  it('huge page value is clamped and shows the empty state', () => {
    const spy = jasmine.createSpy().and.returnValue(of({ items: [], page: 1000000, pageSize: 10, total: 0, totalPages: 0 }));
    TestBed.configureTestingModule({
      imports: [FeedPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: { listPosts: spy } }],
    });
    const f = TestBed.createComponent(FeedPage);
    f.componentRef.setInput('page', '99999999999999999999');
    f.detectChanges();
    f.detectChanges();
    expect(spy).toHaveBeenCalledWith(1_000_000);
    expect((f.nativeElement as HTMLElement).textContent).toContain('No posts on this page.');
  });
});
