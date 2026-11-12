import { Component, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { safeReturnUrl } from '../../core/auth.guard';

type Field = 'username' | 'email' | 'displayName' | 'password';

const trimmedLength = (min: number, max: number) => (c: AbstractControl): ValidationErrors | null => {
  const n = String(c.value ?? '').trim().length;
  return n < min || n > max ? { trimmedLength: true } : null;
};
const hasAt = (c: AbstractControl): ValidationErrors | null =>
  String(c.value ?? '').includes('@') ? null : { email: true };

@Component({
  selector: 'app-signup-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <h1 class="page-title">Sign up</h1>
    <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (banner()) {
        <p class="field-error" role="alert">{{ banner() }}</p>
      }
      <div class="field">
        <label for="su-username">Username</label>
        <input id="su-username" type="text" formControlName="username" autocomplete="username" />
        @if (fieldError('username'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <div class="field">
        <label for="su-email">Email</label>
        <input id="su-email" type="email" formControlName="email" autocomplete="email" />
        @if (fieldError('email'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <div class="field">
        <label for="su-display">Display name</label>
        <input id="su-display" type="text" formControlName="displayName" autocomplete="name" />
        @if (fieldError('displayName'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <div class="field">
        <label for="su-password">Password</label>
        <input id="su-password" type="password" formControlName="password" autocomplete="new-password" />
        @if (fieldError('password'); as e) { <p class="field-error">{{ e }}</p> }
      </div>
      <button class="btn btn-primary" type="submit" [disabled]="pending()">Sign up</button>
    </form>
    <p>Already have an account? <a routerLink="/login">Log in</a></p>
  `,
})
export class SignupPage {
  readonly returnUrl = input<string | undefined>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]{3,20}$/)]],
    email: ['', [Validators.required, hasAt, Validators.maxLength(254)]],
    displayName: ['', [trimmedLength(1, 50)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(200)]],
  });
  readonly pending = signal(false);
  readonly banner = signal<string | null>(null);
  readonly serverFields = signal<Partial<Record<Field, string>>>({});
  private submitted = false;

  private readonly messages: Record<Field, string> = {
    username: 'Username must be 3-20 characters: lowercase letters, numbers, underscores',
    email: 'Enter a valid email address (max 254 characters)',
    displayName: 'Display name must be 1-50 characters',
    password: 'Password must be 8-200 characters',
  };

  fieldError(name: Field): string | null {
    const server = this.serverFields()[name];
    if (server) return server;
    const c = this.form.controls[name];
    return (this.submitted || c.touched) && c.invalid ? this.messages[name] : null;
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
      const v = this.form.getRawValue();
      await this.auth.signup({ ...v, displayName: v.displayName.trim() });
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()) ?? '/me/posts');
    } catch (e) {
      const err = e instanceof ApiError ? e : toApiError(e);
      if (err.code === 'USERNAME_TAKEN') this.serverFields.set({ username: err.message });
      else if (err.code === 'EMAIL_TAKEN') this.serverFields.set({ email: err.message });
      else if (err.code === 'VALIDATION' && err.fields) this.serverFields.set(err.fields as Partial<Record<Field, string>>);
      else this.banner.set(err.message);
    } finally {
      this.pending.set(false);
    }
  }
}
