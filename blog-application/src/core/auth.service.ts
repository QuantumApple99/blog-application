import { Injectable, Signal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { Me } from './api.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly user = signal<Me | null>(null);
  private resolveReady!: () => void;

  readonly currentUser: Signal<Me | null> = this.user.asReadonly();
  readonly ready: Promise<void> = new Promise<void>((r) => (this.resolveReady = r));

  async load(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.api.me()));
    } catch {
      this.user.set(null);
    } finally {
      this.resolveReady();
    }
  }

  async login(input: { username: string; password: string }): Promise<Me> {
    const me = await firstValueFrom(this.api.login(input));
    this.user.set(me);
    return me;
  }

  async signup(input: { username: string; email: string; displayName: string; password: string }): Promise<Me> {
    const me = await firstValueFrom(this.api.signup(input));
    this.user.set(me);
    return me;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } catch {
      // ignore: local state is cleared regardless
    } finally {
      this.user.set(null);
    }
  }

  setUser(me: Me): void {
    this.user.set(me);
  }

  isOwner(username: string): boolean {
    const u = this.user();
    return !!u && u.username === username;
  }
}
