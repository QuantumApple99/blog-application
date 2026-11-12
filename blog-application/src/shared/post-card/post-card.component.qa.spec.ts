import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostSummary } from '../../core/api.models';
import { PostCardComponent } from './post-card.component';

const base: PostSummary = {
  id: 1,
  slug: 'hello-world',
  title: 'Hello World',
  excerpt: 'A short excerpt here',
  status: 'published',
  author: { username: 'ada', displayName: 'Ada Lovelace' },
  createdAt: '2026-03-05T10:00:00Z',
  updatedAt: '2026-03-05T10:00:00Z',
  publishedAt: '2026-03-05T10:00:00Z',
};

function render(post: PostSummary) {
  TestBed.configureTestingModule({ imports: [PostCardComponent], providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(PostCardComponent);
  fixture.componentRef.setInput('post', post);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PostCardComponent (QA)', () => {
  it('C1: title links to /posts/<slug>', () => {
    const a = render(base).querySelector('a[href="/posts/hello-world"]');
    expect(a?.textContent).toContain('Hello World');
  });

  it('C1: author links to /u/<username> showing displayName', () => {
    const a = render(base).querySelector('a[href="/u/ada"]');
    expect(a?.textContent).toContain('Ada Lovelace');
  });

  it('C1: shows excerpt and a date', () => {
    const host = render(base);
    expect(host.textContent).toContain('A short excerpt here');
    expect(host.textContent).toMatch(/2026|Mar/);
  });

  it('C1: Draft badge only for drafts', () => {
    expect(render({ ...base, status: 'draft', publishedAt: null }).textContent).toMatch(/draft/i);
    TestBed.resetTestingModule();
    expect(render(base).textContent).not.toMatch(/draft/i);
  });
});
