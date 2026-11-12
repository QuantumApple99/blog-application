import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, of, switchMap, tap } from 'rxjs';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Post } from '../../core/api.models';
import { LoadState, LoadStateComponent } from '../../shared/load-state/load-state.component';
import { NotFoundViewComponent } from '../not-found/not-found.page';

function notBlank(c: AbstractControl): ValidationErrors | null {
  return typeof c.value === 'string' && c.value.trim().length === 0 ? { blank: true } : null;
}

const FIELDS = ['title', 'body', 'status'] as const;

@Component({
  selector: 'app-editor-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LoadStateComponent, NotFoundViewComponent],
  templateUrl: './editor.page.html',
  styleUrl: './editor.page.css',
})
export class EditorPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly slug = input<string | undefined>();
  readonly isEdit = computed(() => !!this.slug());

  readonly state = signal<LoadState>('loading');
  readonly errorMessage = signal('Could not load the post.');
  readonly notFound = signal(false);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly banner = signal<string | null>(null);
  readonly serverErrors = signal<Record<string, string>>({});

  private readonly load$ = new Subject<string | undefined>();
  private lastSlug: string | undefined | null = null;

  ngOnInit(): void {
    this.requestLoad(this.slug());
  }

  private requestLoad(slug: string | undefined): void {
    this.lastSlug = slug;
    this.load$.next(slug);
  }

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200), notBlank],
    }),
    body: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100000)] }),
    status: new FormControl<'draft' | 'published'>('draft', { nonNullable: true }),
  });

  constructor() {
    for (const f of FIELDS) {
      (this.form.controls[f].valueChanges as Observable<unknown>).pipe(takeUntilDestroyed()).subscribe(() => {
        if (this.serverErrors()[f]) {
          this.serverErrors.update((e) => {
            const { [f]: _, ...rest } = e;
            return rest;
          });
        }
      });
    }

    effect(() => {
      const s = this.slug();
      if (this.lastSlug !== null && s !== this.lastSlug) this.requestLoad(s);
    });
    this.load$
      .pipe(
        tap(() => {
          this.notFound.set(false);
          this.banner.set(null);
          this.serverErrors.set({});
        }),
        switchMap((slug) => {
          if (!slug) {
            this.form.reset({ title: '', body: '', status: 'draft' });
            return of({ kind: 'create' as const });
          }
          this.state.set('loading');
          return this.api.getPost(slug).pipe(
            map((post) => ({ kind: 'post' as const, post })),
            catchError((e) => of({ kind: 'error' as const, err: toApiError(e) })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((r) => {
        if (r.kind === 'create') {
          this.state.set('ready');
        } else if (r.kind === 'error') {
          if (r.err.status === 404) {
            this.notFound.set(true);
          } else {
            this.errorMessage.set(r.err.message || 'Could not load the post.');
            this.state.set('error');
          }
        } else if (!this.auth.isOwner(r.post.author.username)) {
          this.notFound.set(true);
        } else {
          this.fill(r.post);
          this.state.set('ready');
        }
      });
  }

  private fill(post: Post): void {
    this.form.reset({ title: post.title, body: post.body, status: post.status });
  }

  reload(): void {
    this.requestLoad(this.slug());
  }

  fieldError(name: (typeof FIELDS)[number]): string | null {
    const server = this.serverErrors()[name];
    if (server) return server;
    const c = this.form.controls[name];
    if (!c.touched || !c.errors) return null;
    if (c.errors['required'] || c.errors['blank']) return 'Title is required.';
    if (c.errors['maxlength']) {
      return `${name === 'title' ? 'Title' : 'Body'} is too long (max ${c.errors['maxlength'].requiredLength} characters).`;
    }
    return null;
  }

  save(): void {
    if (this.saving() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const input = { title: v.title.trim(), body: v.body, status: v.status };
    const slug = this.slug();
    this.saving.set(true);
    this.banner.set(null);
    const req = slug ? this.api.updatePost(slug, input) : this.api.createPost(input);
    req.subscribe({
      next: (post) => {
        this.saving.set(false);
        this.router.navigateByUrl(post.status === 'published' ? `/posts/${post.slug}` : '/me/posts');
      },
      error: (e) => {
        this.saving.set(false);
        this.handleSaveError(toApiError(e));
      },
    });
  }

  private handleSaveError(err: ReturnType<typeof toApiError>): void {
    if (err.status === 401) {
      this.router.navigateByUrl('/login?returnUrl=' + encodeURIComponent(this.router.url));
      return;
    }
    if (err.status === 400 && err.fields) {
      const mine: Record<string, string> = {};
      const rest: string[] = [];
      for (const [k, msg] of Object.entries(err.fields)) {
        if ((FIELDS as readonly string[]).includes(k)) mine[k] = msg;
        else rest.push(`${k}: ${msg}`);
      }
      this.serverErrors.set(mine);
      if (rest.length) this.banner.set(rest.join(' '));
      else if (!Object.keys(mine).length) this.banner.set(err.message);
      return;
    }
    this.banner.set(err.message);
  }

  remove(): void {
    const slug = this.slug();
    if (!slug) return;
    if (!confirm('Delete this post?')) return;
    this.deleting.set(true);
    this.banner.set(null);
    this.api.deletePost(slug).subscribe({
      next: () => {
        this.deleting.set(false);
        this.router.navigateByUrl('/me/posts');
      },
      error: (e) => {
        this.deleting.set(false);
        this.banner.set(toApiError(e).message);
      },
    });
  }
}
