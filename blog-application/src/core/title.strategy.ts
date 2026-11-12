import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

const SUFFIX = ' · WeBlog';

@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const t = this.buildTitle(snapshot);
    if (!t) this.title.setTitle('WeBlog');
    else if (t === 'WeBlog' || t.endsWith(SUFFIX)) this.title.setTitle(t);
    else this.title.setTitle(t + SUFFIX);
  }
}
