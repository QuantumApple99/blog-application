import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { ApiErrorBody, Me, Page, Post, PostInput, PostSummary, PublicUser } from './api.models';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiErrorBody> | null;
    const e = body && typeof body === 'object' ? body.error : undefined;
    if (e && typeof e === 'object' && typeof e.code === 'string' && typeof e.message === 'string') {
      return new ApiError(err.status, e.code, e.message, e.fields);
    }
    return new ApiError(err.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  return new ApiError(0, 'INTERNAL', GENERIC_MESSAGE);
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private wrap<T>(obs: Observable<T>): Observable<T> {
    return obs.pipe(catchError((e) => throwError(() => toApiError(e))));
  }

  private pageParams(page: number): HttpParams {
    return new HttpParams().set('page', String(page));
  }

  me(): Observable<Me | null> {
    return this.wrap(this.http.get<{ user: Me | null }>('/api/auth/me').pipe(map((r) => r.user ?? null)));
  }

  signup(input: { username: string; email: string; displayName: string; password: string }): Observable<Me> {
    return this.wrap(this.http.post<{ user: Me }>('/api/auth/signup', input).pipe(map((r) => r.user)));
  }

  login(input: { username: string; password: string }): Observable<Me> {
    return this.wrap(this.http.post<{ user: Me }>('/api/auth/login', input).pipe(map((r) => r.user)));
  }

  logout(): Observable<void> {
    return this.wrap(this.http.post<void>('/api/auth/logout', {}).pipe(map(() => undefined)));
  }

  updateMe(input: { displayName?: string; bio?: string }): Observable<Me> {
    return this.wrap(this.http.patch<{ user: Me }>('/api/users/me', input).pipe(map((r) => r.user)));
  }

  getUser(username: string): Observable<PublicUser> {
    return this.wrap(
      this.http.get<{ user: PublicUser }>(`/api/users/${encodeURIComponent(username)}`).pipe(map((r) => r.user)),
    );
  }

  getUserPosts(username: string, page = 1): Observable<Page<PostSummary>> {
    return this.wrap(
      this.http.get<Page<PostSummary>>(`/api/users/${encodeURIComponent(username)}/posts`, {
        params: this.pageParams(page),
      }),
    );
  }

  listPosts(page = 1): Observable<Page<PostSummary>> {
    return this.wrap(this.http.get<Page<PostSummary>>('/api/posts', { params: this.pageParams(page) }));
  }

  getPost(slug: string): Observable<Post> {
    return this.wrap(
      this.http.get<{ post: Post }>(`/api/posts/${encodeURIComponent(slug)}`).pipe(map((r) => r.post)),
    );
  }

  listMyPosts(page = 1, status?: 'draft' | 'published'): Observable<Page<PostSummary>> {
    let params = this.pageParams(page);
    if (status) params = params.set('status', status);
    return this.wrap(this.http.get<Page<PostSummary>>('/api/me/posts', { params }));
  }

  createPost(input: PostInput): Observable<Post> {
    return this.wrap(this.http.post<{ post: Post }>('/api/posts', input).pipe(map((r) => r.post)));
  }

  updatePost(slug: string, input: Partial<PostInput>): Observable<Post> {
    return this.wrap(
      this.http.patch<{ post: Post }>(`/api/posts/${encodeURIComponent(slug)}`, input).pipe(map((r) => r.post)),
    );
  }

  deletePost(slug: string): Observable<void> {
    return this.wrap(
      this.http.delete<void>(`/api/posts/${encodeURIComponent(slug)}`).pipe(map(() => undefined)),
    );
  }
}
