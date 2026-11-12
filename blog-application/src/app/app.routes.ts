import { Routes } from '@angular/router';
import { authGuard, guestGuard } from '../core/auth.guard';

export const routes: Routes = [
  { path: '', title: 'WeBlog', loadComponent: () => import('../pages/feed/feed.page').then((m) => m.FeedPage) },
  { path: 'posts/:slug', title: 'WeBlog', loadComponent: () => import('../pages/post/post.page').then((m) => m.PostPage) },
  { path: 'u/:username', title: 'WeBlog', loadComponent: () => import('../pages/author/author.page').then((m) => m.AuthorPage) },
  { path: 'me/posts', title: 'My posts', canActivate: [authGuard], loadComponent: () => import('../pages/my-posts/my-posts.page').then((m) => m.MyPostsPage) },
  { path: 'me/posts/new', title: 'New post', canActivate: [authGuard], loadComponent: () => import('../pages/editor/editor.page').then((m) => m.EditorPage) },
  { path: 'me/posts/:slug/edit', title: 'Edit post', canActivate: [authGuard], loadComponent: () => import('../pages/editor/editor.page').then((m) => m.EditorPage) },
  { path: 'login', title: 'Log in', canActivate: [guestGuard], loadComponent: () => import('../pages/login/login.page').then((m) => m.LoginPage) },
  { path: 'signup', title: 'Sign up', canActivate: [guestGuard], loadComponent: () => import('../pages/signup/signup.page').then((m) => m.SignupPage) },
  { path: '**', title: 'Not found', loadComponent: () => import('../pages/not-found/not-found.page').then((m) => m.NotFoundPage) },
];
