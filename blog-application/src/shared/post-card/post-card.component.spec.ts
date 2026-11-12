import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostSummary } from '../../core/api.models';
import { PostCardComponent } from './post-card.component';

const post: PostSummary = {
  id: 1, slug: 'hello', title: 'Hello', excerpt: 'Excerpt text', status: 'draft',
  author: { username: 'bob', displayName: 'Bob B' },
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', publishedAt: null,
};

describe('PostCardComponent (smoke)', () => {
  it('renders links, excerpt and draft badge', () => {
    TestBed.configureTestingModule({ imports: [PostCardComponent], providers: [provideRouter([])] });
    const f = TestBed.createComponent(PostCardComponent);
    f.componentRef.setInput('post', post);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/posts/hello"]')?.textContent).toContain('Hello');
    expect(el.querySelector('a[href="/u/bob"]')?.textContent).toContain('Bob B');
    expect(el.textContent).toContain('Excerpt text');
    expect(el.querySelector('.badge-draft')?.textContent).toContain('Draft');
  });
});
