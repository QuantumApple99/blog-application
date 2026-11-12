import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Post } from '../../core/api.models';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LoadState, LoadStateComponent } from '../../shared/load-state/load-state.component';
import { NotFoundViewComponent } from '../not-found/not-found.page';

@Component({
  selector: 'app-post-page',
  standalone: true,
  imports: [LoadStateComponent, NotFoundViewComponent, RouterLink, DatePipe],
  templateUrl: './post.page.html',
  styleUrl: './post.page.css',
})
export class PostPage {
  readonly slug = input<string | undefined>();

  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly titleService = inject(Title);

  private readonly attempt = signal(0);
  readonly state = signal<LoadState>('loading');
  readonly post = signal<Post | null>(null);
  readonly notFound = signal(false);
  readonly errorMessage = signal('Could not load post.');
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  readonly isOwner = computed(() => {
    const p = this.post();
    return !!p && this.auth.isOwner(p.author.username);
  });

  constructor() {
    toObservable(computed(() => ({ s: this.slug(), a: this.attempt() })))
      .pipe(
        switchMap(({ s }) =>
          this.api.getPost(s ?? '').pipe(
            map((post) => ({ kind: 'ok' as const, post })),
            catchError((e) => of({ kind: 'err' as const, err: toApiError(e) })),
            startWith({ kind: 'loading' as const }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((res) => {
        if (res.kind === 'loading') {
          this.state.set('loading');
          this.notFound.set(false);
          this.deleteError.set(null);
        } else if (res.kind === 'err') {
          this.post.set(null);
          if (res.err.status === 404) {
            this.notFound.set(true);
            this.titleService.setTitle('Not found · WeBlog');
          } else {
            this.errorMessage.set(res.err.message || 'Could not load post.');
            this.state.set('error');
          }
        } else {
          this.post.set(res.post);
          this.state.set('ready');
          this.titleService.setTitle(`${res.post.title} · WeBlog`);
        }
      });
  }

  reload(): void {
    this.attempt.update((n) => n + 1);
  }

  remove(): void {
    const post = this.post();
    if (!post) return;
    if (!confirm('Delete this post?')) return;
    this.deleting.set(true);
    this.deleteError.set(null);
    this.api.deletePost(post.slug).subscribe({
      next: () => {
        this.deleting.set(false);
        this.router.navigateByUrl('/me/posts');
      },
      error: (e) => {
        this.deleting.set(false);
        this.deleteError.set(toApiError(e).message);
      },
    });
  }
}
