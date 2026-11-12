import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Page, PostSummary } from '../../core/api.models';
import { LoadState, LoadStateComponent } from '../../shared/load-state/load-state.component';
import { PaginationComponent, parsePageParam } from '../../shared/pagination/pagination.component';
import { PostCardComponent } from '../../shared/post-card/post-card.component';

@Component({
  selector: 'app-feed-page',
  standalone: true,
  imports: [LoadStateComponent, PostCardComponent, PaginationComponent],
  template: `
    <h1 class="page-title">Latest posts</h1>
    <app-load-state
      [state]="state()"
      [errorMessage]="errorMessage()"
      [emptyMessage]="emptyMessage()"
      [emptyActionLabel]="emptyActionLabel()"
      [emptyActionLink]="emptyActionLink()"
      (retry)="reload()"
    >
      <div class="stack">
        @for (p of items(); track p.id) {
          <app-post-card [post]="p" />
        }
      </div>
      <app-pagination [page]="pageNum()" [totalPages]="totalPages()" />
    </app-load-state>
  `,
})
export class FeedPage {
  readonly page = input<string | undefined>();

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);

  readonly pageNum = computed(() => parsePageParam(this.page()));
  private readonly attempt = signal(0);

  readonly state = signal<LoadState>('loading');
  readonly items = signal<PostSummary[]>([]);
  readonly totalPages = signal(1);
  readonly errorMessage = signal('Could not load posts.');

  readonly emptyMessage = computed(() => (this.pageNum() > 1 ? 'No posts on this page.' : 'No posts yet.'));
  readonly emptyActionLabel = computed(() =>
    this.pageNum() > 1 ? 'Go to page 1' : this.auth.currentUser() ? 'Write one' : 'Sign up',
  );
  readonly emptyActionLink = computed(() =>
    this.pageNum() > 1 ? '/' : this.auth.currentUser() ? '/me/posts/new' : '/signup',
  );

  constructor() {
    this.title.setTitle('WeBlog');
    toObservable(computed(() => ({ n: this.pageNum(), a: this.attempt() })))
      .pipe(
        switchMap(({ n }) =>
          this.api.listPosts(n).pipe(
            map((r: Page<PostSummary>) => ({ kind: 'ok' as const, r })),
            catchError((e) => of({ kind: 'err' as const, msg: toApiError(e).message })),
            startWith({ kind: 'loading' as const }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        if (res.kind === 'loading') {
          this.state.set('loading');
        } else if (res.kind === 'err') {
          this.errorMessage.set(res.msg || 'Could not load posts.');
          this.state.set('error');
        } else {
          this.items.set(res.r.items);
          this.totalPages.set(res.r.totalPages);
          this.state.set(res.r.items.length ? 'ready' : 'empty');
        }
      });
  }

  reload(): void {
    this.attempt.update((n) => n + 1);
  }
}
