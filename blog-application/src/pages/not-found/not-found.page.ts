import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found-view',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="stack">
      <h1 class="page-title">Page not found</h1>
      <p class="muted">We couldn't find what you were looking for.</p>
      <a class="btn btn-primary" routerLink="/">Back to home</a>
    </section>
  `,
})
export class NotFoundViewComponent {}

@Component({
  selector: 'app-not-found-page',
  standalone: true,
  imports: [NotFoundViewComponent],
  template: '<app-not-found-view />',
})
export class NotFoundPage {}
