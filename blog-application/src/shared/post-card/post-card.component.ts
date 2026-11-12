import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PostSummary } from '../../core/api.models';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <article class="card stack">
      <h2 class="title">
        <a [routerLink]="['/posts', post().slug]">{{ post().title }}</a>
        @if (post().status === 'draft') {
          <span class="badge badge-draft">Draft</span>
        }
      </h2>
      <p class="excerpt">{{ post().excerpt }}</p>
      <p class="meta muted">
        <a [routerLink]="['/u', post().author.username]">{{ post().author.displayName }}</a>
        · {{ post().publishedAt ?? post().createdAt | date: 'mediumDate' }}
      </p>
    </article>
  `,
  styles: `
    .title { margin: 0; font-size: 1.25rem; overflow-wrap: anywhere; }
    .excerpt { margin: 0; overflow-wrap: anywhere; }
    .meta { margin: 0; }
    .card { gap: var(--space-2); }
  `,
})
export class PostCardComponent {
  readonly post = input.required<PostSummary>();
}
