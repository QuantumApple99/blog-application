import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { PostPage } from './post.page';

const post = {
  id: 1, slug: 's', title: 'T', excerpt: '', status: 'published', body: 'x', html: '<p class="hi">Hello <strong>w</strong></p>',
  author: { username: 'bob', displayName: 'Bob' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '', publishedAt: null,
};

function setup(owner: boolean) {
  TestBed.configureTestingModule({
    imports: [PostPage],
    providers: [
      provideRouter([]),
      { provide: ApiService, useValue: { getPost: () => of(post) } },
      { provide: AuthService, useValue: { isOwner: () => owner } },
    ],
  });
  const f = TestBed.createComponent(PostPage);
  f.componentRef.setInput('slug', 's');
  f.detectChanges();
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('PostPage (smoke)', () => {
  it('binds innerHTML, hides owner controls for others', () => {
    const el = setup(false);
    expect(el.querySelector('.post-body strong')?.textContent).toBe('w');
    expect(el.querySelector('.btn-danger')).toBeNull();
  });
  it('shows owner controls', () => {
    const el = setup(true);
    expect(el.querySelector('.btn-danger')).not.toBeNull();
    expect(el.textContent).toContain('Edit');
  });
});
