import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

export type LoadState = 'loading' | 'error' | 'empty' | 'ready';

@Component({
  selector: 'app-load-state',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './load-state.component.html',
  styleUrl: './load-state.component.css',
})
export class LoadStateComponent {
  readonly state = input.required<LoadState>();
  readonly errorMessage = input<string | undefined>();
  readonly emptyMessage = input<string | undefined>();
  readonly emptyActionLabel = input<string | undefined>();
  readonly emptyActionLink = input<string | any[] | undefined>();
  readonly retry = output<void>();
}
