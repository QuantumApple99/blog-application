import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, map, of, switchMap, tap } from 'rxjs';
import { Page, PostSummary } from '../../core/api.models';
import { ApiService, toApiError } from '../../core/api.service';
import { LoadState, LoadStateComponent } from '../../shared/load-state/load-state.component';
import { PaginationComponent } from '../../shared/pagination/pagination.component';

@Component({
  selector: 'app-my-posts-page',
  standalone: true,
  imports: [DatePipe, RouterLink, LoadStateComponent, PaginationComponent],
  templateUrl: './my-posts.page.html',
  styleUrl: './my-posts.page.css',
})
export class MyPostsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly page = input<string>();
  readonly pageNum = computed(() => {
    const p = this.page();
    if (typeof p !== 'string' || !/^\d+$/.test(p)) return 1;
    const n = Number(p);
    return n < 1 ? 1 : Math.min(n, 1_000_000);
  });

  readonly state = signal<LoadState>('loading');
  readonly errorMessage = signal('Could not load your posts.');
  readonly items = signal<PostSummary[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly deleting = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);

  private readonly load$ = new Subject<number>();
  private lastPage: number | null = null;

  ngOnInit(): void {
    this.requestLoad(this.pageNum());
  }

  private requestLoad(n: number): void {
    this.lastPage = n;
    this.load$.next(n);
  }

  constructor() {
    effect(() => {
      const n = this.pageNum();
      if (this.lastPage !== null && n !== this.lastPage) this.requestLoad(n);
    });
    this.load$
      .pipe(
        tap(() => {
          this.state.set('loading');
          this.deleteError.set(null);
        }),
        switchMap((n) =>
          this.api.listMyPosts(n).pipe(
            map((res) => ({ ok: true as const, res })),
            catchError((e) => of({ ok: false as const, err: toApiError(e) })),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        if (!r.ok) {
          if (r.err.status === 401) {
            this.router.navigateByUrl('/login?returnUrl=%2Fme%2Fposts');
            return;
          }
          this.errorMessage.set(r.err.message || 'Could not load your posts.');
          this.state.set('error');
          return;
        }
        this.apply(r.res);
      });
  }

  private apply(res: Page<PostSummary>): void {
    this.items.set(res.items);
    this.total.set(res.total);
    this.totalPages.set(res.totalPages);
    this.state.set(res.items.length === 0 ? 'empty' : 'ready');
    if (res.items.length === 0 && this.pageNum() > 1) {
      this.emptyMessage.set('No posts on this page.');
    } else {
      this.emptyMessage.set('No posts yet.');
    }
  }

  readonly emptyMessage = signal('No posts yet.');

  retry(): void {
    this.requestLoad(this.pageNum());
  }

  remove(post: PostSummary): void {
    if (!confirm(`Delete "${post.title}"?`)) return;
    this.deleting.set(post.slug);
    this.deleteError.set(null);
    this.api.deletePost(post.slug).subscribe({
      next: () => {
        this.deleting.set(null);
        const n = this.pageNum();
        const hadLater = n < this.totalPages();
        this.items.update((l) => l.filter((p) => p.slug !== post.slug));
        this.total.update((t) => Math.max(0, t - 1));
        if (this.items().length === 0) {
          if (n > 1) {
            this.router.navigate(['/me/posts'], { queryParams: { page: n - 1 } });
          } else if (hadLater) {
            this.retry();
          } else {
            this.state.set('empty');
            this.emptyMessage.set('No posts yet.');
          }
        } else if (hadLater) {
          this.retry();
        }
      },
      error: (e) => {
        this.deleting.set(null);
        this.deleteError.set(toApiError(e).message);
      },
    });
  }
}
