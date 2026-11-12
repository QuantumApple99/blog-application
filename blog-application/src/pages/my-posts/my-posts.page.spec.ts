import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiError, ApiService } from '../../core/api.service';
import { MyPostsPage } from './my-posts.page';

const mk = (id: number, status: 'draft' | 'published') => ({
  id, slug: `p${id}`, title: `Post ${id}`, excerpt: '', status,
  author: { username: 'a', displayName: 'A' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
  publishedAt: status === 'published' ? '2026-01-01T00:00:00Z' : null,
});

describe('MyPostsPage', () => {
  let api: jasmine.SpyObj<ApiService>;
  beforeEach(() => {
    api = jasmine.createSpyObj('ApiService', ['listMyPosts', 'deletePost']);
    api.listMyPosts.and.returnValue(
      of({ items: [mk(1, 'published'), mk(2, 'draft')], page: 1, pageSize: 10, total: 2, totalPages: 1 }),
    );
    TestBed.configureTestingModule({
      imports: [MyPostsPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
  });

  it('renders rows with badges', () => {
    const f = TestBed.createComponent(MyPostsPage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelectorAll('.card').length).toBe(2);
    expect(el.querySelectorAll('.badge-draft').length).toBe(1);
    expect(el.textContent).toContain('Published');
  });

  it('delete respects confirm', () => {
    const f = TestBed.createComponent(MyPostsPage);
    f.detectChanges();
    const btn: HTMLButtonElement = f.nativeElement.querySelector('.btn-danger');
    spyOn(window, 'confirm').and.returnValue(false);
    btn.click();
    expect(api.deletePost).not.toHaveBeenCalled();
    (window.confirm as jasmine.Spy).and.returnValue(true);
    api.deletePost.and.returnValue(of(undefined));
    btn.click();
    f.detectChanges();
    expect(api.deletePost).toHaveBeenCalledWith('p1');
    expect(f.nativeElement.querySelectorAll('.card').length).toBe(1);
  });
});

describe('MyPostsPage error', () => {
  it('shows alert and Retry', () => {
    const api = jasmine.createSpyObj('ApiService', ['listMyPosts', 'deletePost']);
    api.listMyPosts.and.returnValue(throwError(() => new ApiError(500, 'INTERNAL', 'Boom')));
    TestBed.configureTestingModule({
      imports: [MyPostsPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    const f = TestBed.createComponent(MyPostsPage);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role=alert]')?.textContent).toContain('Boom');
    expect(f.nativeElement.textContent).toContain('Retry');
  });
});

describe('MyPostsPage page parsing', () => {
  const parse = (v: string | undefined) => {
    const api = jasmine.createSpyObj('ApiService', ['listMyPosts', 'deletePost']);
    api.listMyPosts.and.returnValue(of({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }));
    TestBed.configureTestingModule({
      imports: [MyPostsPage],
      providers: [provideRouter([]), { provide: ApiService, useValue: api }],
    });
    const f = TestBed.createComponent(MyPostsPage);
    f.componentRef.setInput('page', v);
    f.detectChanges();
    return f.componentInstance.pageNum();
  };
  it('clamps and sanitizes', () => {
    expect(parse('99999999999999999999')).toBe(1_000_000);
  });
  it('falls back to 1', () => {
    TestBed.resetTestingModule();
    expect(parse('-3')).toBe(1);
  });
});
