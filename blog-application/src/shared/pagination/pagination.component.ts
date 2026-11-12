import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (totalPages() > 1) {
      <nav aria-label="Pagination" class="pagination">
        @if (page() > 1) {
          <a class="btn" routerLink="." [queryParams]="{ page: page() - 1 }">Previous</a>
        }
        <span class="muted">Page {{ page() }} of {{ totalPages() }}</span>
        @if (page() < totalPages()) {
          <a class="btn" routerLink="." [queryParams]="{ page: page() + 1 }">Next</a>
        }
      </nav>
    }
  `,
  styles: `
    .pagination { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); margin-top: var(--space-4); }
    .pagination .btn { text-decoration: none; }
    .pagination span { min-height: 40px; display: inline-flex; align-items: center; }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
}

const MAX_PAGE = 1_000_000;

/** Parses a `page` route input: digits only, at least 1, clamped to MAX_PAGE; anything else is 1. */
export function parsePageParam(raw: string | undefined | null): number {
  if (raw == null || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return MAX_PAGE;
  return Math.min(MAX_PAGE, Math.max(1, Math.trunc(n)));
}
