import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { AuthorPage } from './author.page';

function setup(owner: boolean) {
  const user = { username: 'bob', displayName: 'Bob', bio: '', createdAt: '' };
  const me = signal<unknown>(owner ? { username: 'bob' } : null);
  TestBed.configureTestingModule({
    imports: [AuthorPage],
    providers: [
      provideRouter([]),
      {
        provide: ApiService,
        useValue: {
          getUser: () => of(user),
          getUserPosts: () => of({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 }),
        },
      },
      { provide: AuthService, useValue: { currentUser: me, isOwner: (u: string) => !!owner && u === 'bob' } },
    ],
  });
  const f = TestBed.createComponent(AuthorPage);
  f.componentRef.setInput('username', 'bob');
  f.detectChanges();
  f.detectChanges();
  return f;
}

describe('AuthorPage (smoke)', () => {
  it('no form for non-owner', () => {
    const el = setup(false).nativeElement as HTMLElement;
    expect(el.textContent).toContain('No bio yet.');
    expect(el.textContent).not.toContain('Edit profile');
  });
  it('form for owner', () => {
    const f = setup(true);
    const el = f.nativeElement as HTMLElement;
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit profile')) as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelector('form')).not.toBeNull();
  });
});
