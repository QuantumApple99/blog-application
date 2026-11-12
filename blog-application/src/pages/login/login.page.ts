import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { safeReturnUrl } from '../../core/auth.guard';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="page-title">Log in</h1>
    <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (banner()) {
        <p class="field-error" role="alert">{{ banner() }}</p>
      }
      <div class="field">
        <label for="login-username">Username or email</label>
        <input id="login-username" type="text" formControlName="username" autocomplete="username" />
        @if (fieldError('username'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <div class="field">
        <label for="login-password">Password</label>
        <input id="login-password" type="password" formControlName="password" autocomplete="current-password" />
        @if (fieldError('password'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <button class="btn btn-primary" type="submit" [disabled]="pending()">Log in</button>
    </form>
    <p>No account? <a routerLink="/signup">Sign up</a></p>
  `,
})
export class LoginPage {
  readonly returnUrl = input<string | undefined>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  readonly pending = signal(false);
  readonly banner = signal<string | null>(null);
  readonly serverFields = signal<Record<string, string>>({});
  private submitted = false;

  fieldError(name: 'username' | 'password'): string | null {
    const server = this.serverFields()[name];
    if (server) return server;
    const c = this.form.controls[name];
    if (this.submitted && c.hasError('required')) {
      return name === 'username' ? 'Username or email is required' : 'Password is required';
    }
    return null;
  }

  async submit(): Promise<void> {
    this.submitted = true;
    this.banner.set(null);
    this.serverFields.set({});
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    try {
      const { username, password } = this.form.getRawValue();
      await this.auth.login({ username, password });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? '/me/posts');
    } catch (e) {
      const err = e instanceof ApiError ? e : toApiError(e);
      if (err.status === 401) this.banner.set('Invalid username or password');
      else if (err.status === 400 && err.fields) this.serverFields.set(err.fields);
      else this.banner.set(err.message);
    } finally {
      this.pending.set(false);
    }
  }
}
