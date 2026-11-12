import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { AppTitleStrategy } from './title.strategy';

@Component({ template: '', standalone: true })
class Dummy {}

describe('AppTitleStrategy (QA)', () => {
  let router: Router;
  let title: Title;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: Dummy, title: 'My posts' },
          { path: 'b', component: Dummy },
          { path: 'c', component: Dummy, title: 'My posts · WeBlog' },
          { path: 'd', component: Dummy, title: 'WeBlog' },
        ]),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
    title = TestBed.inject(Title);
  });
  it('adds suffix', async () => { await router.navigateByUrl('/a'); expect(title.getTitle()).toBe('My posts · WeBlog'); });
  it('no title -> WeBlog', async () => { await router.navigateByUrl('/b'); expect(title.getTitle()).toBe('WeBlog'); });
  it('does not double suffix', async () => { await router.navigateByUrl('/c'); expect(title.getTitle()).toBe('My posts · WeBlog'); });
  it('exactly WeBlog stays', async () => { await router.navigateByUrl('/d'); expect(title.getTitle()).toBe('WeBlog'); });
});
