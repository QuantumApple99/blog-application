import { Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs';
import { Page, PostSummary, PublicUser } from '../../core/api.models';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { LoadState, LoadStateComponent } from '../../shared/load-state/load-state.component';
import { PaginationComponent, parsePageParam } from '../../shared/pagination/pagination.component';
import { PostCardComponent } from '../../shared/post-card/post-card.component';
import { NotFoundViewComponent } from '../not-found/not-found.page';

function trimmedLength(min: number, max: number) {
  return (c: AbstractControl): ValidationErrors | null => {
    const len = String(c.value ?? '').trim().length;
    if (len < min) return { required: true };
    if (len > max) return { maxlength: true };
    return null;
  };
}

@Component({
  selector: 'app-author-page',
  standalone: true,
  imports: [LoadStateComponent, NotFoundViewComponent, PostCardComponent, PaginationComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './author.page.html',
  styleUrl: './author.page.css',
})
export class AuthorPage {
  readonly username = input<string | undefined>();
  readonly page = input<string | undefined>();

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly titleService = inject(Title);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly pageNum = computed(() => parsePageParam(this.page()));
  private readonly attempt = signal(0);

  readonly state = signal<LoadState>('loading');
  readonly notFound = signal(false);
  readonly user = signal<PublicUser | null>(null);
  readonly items = signal<PostSummary[]>([]);
  readonly totalPages = signal(1);
  readonly errorMessage = signal('Could not load profile.');

  readonly isOwner = computed(() => this.auth.isOwner(this.username() ?? '') && this.auth.currentUser() !== null);
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly banner = signal<string | null>(null);
  readonly serverErrors = signal<{ displayName?: string; bio?: string }>({});

  readonly form = this.fb.group({
    displayName: ['', [trimmedLength(1, 50)]],
    bio: ['', [Validators.maxLength(500)]],
  });

  readonly emptyMessage = computed(() =>
    this.pageNum() > 1 ? 'No posts on this page.' : 'No published posts yet.',
  );

  constructor() {
    toObservable(computed(() => ({ u: this.username(), n: this.pageNum(), a: this.attempt() })))
      .pipe(
        switchMap(({ u, n }) =>
          forkJoin({ user: this.api.getUser(u ?? ''), posts: this.api.getUserPosts(u ?? '', n) }).pipe(
            map((r) => ({ kind: 'ok' as const, ...r })),
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
        } else if (res.kind === 'err') {
          if (res.err.status === 404) {
            this.notFound.set(true);
            this.titleService.setTitle('Not found · WeBlog');
          } else {
            this.errorMessage.set(res.err.message || 'Could not load profile.');
            this.state.set('error');
          }
        } else {
          const posts: Page<PostSummary> = res.posts;
          this.user.set(res.user);
          this.items.set(posts.items);
          this.totalPages.set(posts.totalPages);
          this.state.set('ready');
          this.titleService.setTitle(`${res.user.displayName} · WeBlog`);
        }
      });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.serverErrors().displayName || this.serverErrors().bio) this.serverErrors.set({});
    });
  }

  reload(): void {
    this.attempt.update((n) => n + 1);
  }

  startEdit(): void {
    const u = this.user();
    this.form.reset({ displayName: u?.displayName ?? '', bio: u?.bio ?? '' });
    this.serverErrors.set({});
    this.banner.set(null);
    this.editing.set(true);
  }

  cancel(): void {
    const u = this.user();
    this.form.reset({ displayName: u?.displayName ?? '', bio: u?.bio ?? '' });
    this.serverErrors.set({});
    this.banner.set(null);
    this.editing.set(false);
  }

  fieldError(name: 'displayName' | 'bio'): string | null {
    const server = this.serverErrors()[name];
    if (server) return server;
    const c = this.form.controls[name];
    if (!c.touched || !c.errors) return null;
    if (name === 'displayName') {
      return c.errors['required'] ? 'Display name is required.' : 'Display name must be at most 50 characters.';
    }
    return 'Bio must be at most 500 characters.';
  }

  save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { displayName, bio } = this.form.getRawValue();
    this.saving.set(true);
    this.banner.set(null);
    this.api.updateMe({ displayName: displayName.trim(), bio }).subscribe({
      next: (me) => {
        this.saving.set(false);
        this.auth.setUser(me);
        this.user.set(me);
        this.titleService.setTitle(`${me.displayName} · WeBlog`);
        this.editing.set(false);
      },
      error: (e) => {
        this.saving.set(false);
        const err = toApiError(e);
        const f = err.fields ?? {};
        if (err.status === 400 && (f['displayName'] || f['bio'])) {
          this.serverErrors.set({ displayName: f['displayName'], bio: f['bio'] });
        } else {
          this.banner.set(err.message);
        }
      },
    });
  }
}
