# Briefs from md-web: mgr-app-shell and mgr-posts-ui

All paths are under /Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application/src. Naming follows contracts "## API" + "## Reconciliation": `body` and `html`, `fields`, `totalPages`, and the editor route `/me/posts/:slug/edit`.

## SHARED RULES (both managers)
- Angular 18: standalone components, signals, reactive forms.
- HttpClient and URLs appear only in core/api.service.ts and core/ssr-api.interceptor.ts.
- No bypassSecurityTrust*. No new deps.
- Don't touch server.ts, api/**, package.json, angular.json, main.server.ts or ssr-request.token.ts. (ssr-request.token.ts already exists, created by the CEO: `SSR_REQUEST: InjectionToken<{cookie, origin}>`.)
- Specs use HttpTestingController or a mocked ApiService.
- Test command: `npx ng test --watch=false --browsers=ChromeHeadless`. Report it if Karma needs a --no-sandbox launcher; that's mgr-delivery's config.
- Backend is built in parallel. Frontend code must compile and specs must pass with mocks, without the backend.

## mgr-app-shell
Staff: eng-routing-shell implements; qa-app-shell writes specs from the contract only.

**Goal:** the foundation everything else builds on: core/, the app shell and header, routes with placeholder pages, login, signup, 404, shared LoadState, global styles, deletion of old code, and rewritten specs.

**Owns:**
- src/app/** (app.component.*, app.routes.ts, app.config.ts, app.config.server.ts)
- src/core/**: api.service.ts, api.models.ts, auth.service.ts, auth.guard.ts, ssr-api.interceptor.ts, title.strategy.ts, plus their specs
- src/header/** (nav merged in)
- src/shared/load-state/**
- src/styles.css
- src/pages/{login,signup,not-found}/**
- day-1 stub files src/pages/{feed,post,author,my-posts,editor}/<x>.page.ts

**Deletes:** src/{nav,login,logout,landing-page,body,logged-in-body,blog,blog-view,new-blog}/, src/login.service.ts, blogs.service.ts, blogs.format.ts, and their specs. **Rewrites** src/app/app.component.spec.ts.

**Does NOT own** src/shared/post-card/** or src/shared/pagination/**. Those belong to mgr-posts-ui.

**app.routes.ts and app.config.ts are owned only by mgr-app-shell.**

Routes, per the contract table:
- All routes lazy (`loadComponent`), each with a title.
- Editor path `me/posts/:slug/edit`, plus `me/posts/new`.
- authGuard on `me/*`; guestGuard on login and signup.
- `**` → NotFound.

app.config:
- `provideRouter(routes, withComponentInputBinding())`
- `provideHttpClient(withFetch(), withInterceptors([ssrApiInterceptor]))`
- `provideClientHydration(withHttpTransferCacheOptions({filter: excludes /api/auth/me, includePostRequests:false}))`. Verify the filter option exists in Angular 18; if not, bypass the cache another way and report it.
- A TitleStrategy that appends " · WeBlog".
- An app initializer that calls `auth.load()` on both server and browser.

**How mgr-posts-ui plugs in:** on day 1, create stub files with named standalone exports whose template is `<p>TODO</p>`:
- src/pages/feed/feed.page.ts (FeedPage)
- post/post.page.ts (PostPage)
- author/author.page.ts (AuthorPage)
- my-posts/my-posts.page.ts (MyPostsPage)
- editor/editor.page.ts (EditorPage)

Routes reference them as `loadComponent: () => import('../pages/<x>/<x>.page').then(m=>m.<Name>Page)`. mgr-posts-ui then owns and replaces those files and never edits routes. Route inputs bind by name: `slug`, `username`, `page` (from ?page=).

**Interfaces to publish FIRST:**
- **api.models.ts:** PublicUser, Me, PostSummary, Post, Page<T>, `PostInput={title, body, status:'draft'|'published'}`, ApiErrorBody, exactly per "## API".
- **ApiService** (providedIn root; every method returns an Observable):
  - me(): Me|null
  - signup({username,email,displayName,password}): Me; login({username,password}): Me; logout(): void
  - updateMe({displayName?,bio?}): Me
  - getUser(username): PublicUser; getUserPosts(username, page=1): Page<PostSummary>
  - listPosts(page=1); getPost(slug): Post; listMyPosts(page=1, status?)
  - createPost(PostInput): Post; updatePost(slug, Partial<PostInput>): Post; deletePost(slug): void
  - It unwraps `{user}` and `{post}` responses. Errors are mapped to an exported `class ApiError {status, code, message, fields?}` via a `toApiError` helper.
- **AuthService** (root):
  - `currentUser: Signal<Me|null>` (readonly); `ready: Promise<void>`
  - `load()`; `login(i)` and `signup(i)`: Promise<Me>, rejecting with ApiError; `logout(): Promise<void>`
  - `setUser(Me)`; `isOwner(username): boolean`
- **Guards** authGuard and guestGuard (CanActivateFn):
  - Logged out on /me/* → UrlTree `/login?returnUrl=<enc>`.
  - Logged in on /login or /signup → /me/posts.
  - A returnUrl is accepted only if it starts with '/' and not '//'.
- **LoadStateComponent** (`app-load-state`, src/shared/load-state/load-state.component):
  - Inputs: `state: 'loading'|'error'|'empty'|'ready'` (export `type LoadState`), errorMessage?, emptyMessage?, emptyActionLabel?, emptyActionLink?.
  - Output: `retry`.
  - Projects the ready content. role=status while loading; role=alert plus a Retry button on error.
  - Also export NotFoundViewComponent from src/pages/not-found/ for in-place 404s (pages check `ApiError.status===404`).
- **styles.css:**
  - Tokens --color-*, --space-*, --radius. Keep the logo and header colors.
  - `.container`: max-width 720px, 16px gutter.
  - Classes: .btn .btn-primary .btn-danger .btn-link .field .field-error .badge .badge-draft .card .page-title .muted .stack.
  - Controls at least 40px tall; box-sizing border-box; overflow-x hidden on body as a safety net.
  - Components reuse these classes rather than redefining them.
- **Header:**
  - Logo and Home.
  - Logged in: Write (/me/posts/new), My posts, Profile (/u/<username>), Logout. Logged out: Login, Signup.
  - routerLinkActive; wraps at 375px; correct in SSR from currentUser().
- **Login:**
  - Fields: username (accepts username or email) and password.
  - Submit is disabled while the request is pending.
  - Any 401 shows "Invalid username or password"; a 400 shows field errors.
  - Success goes to a valid returnUrl, otherwise /me/posts.
- **Signup:**
  - Client validators match the API: username `^[a-z0-9_]{3,20}$`, password at least 8, and so on.
  - USERNAME_TAKEN shows under username, EMAIL_TAKEN under email, and VALIDATION fields under their inputs.

**Sequence:**
1. Models, the ApiService skeleton, AuthService, the 5 stubs, routes and app.config, then notify posts-ui.
2. LoadState and styles, then notify again.
3. Header, login, signup, 404, the interceptor (when SSR_REQUEST is present, rewrite `/api/...` to `origin+url` and set the Cookie header; otherwise pass through) and the TitleStrategy.
4. Deletions and the app spec rewrite.
5. QA specs: guards, AuthService, login and signup error messages, LoadState rendering, header logged in vs logged out, TitleStrategy, interceptor.

**Returns:** changed and deleted files, test and build results, deviations, and any signature differences.

## mgr-posts-ui
Staff: eng-reader (feed, post, author, post-card, pagination); eng-editor (my-posts, editor); qa-posts-ui writes specs from the contract only.

**Goal:** all the content pages.

**Owns:** src/pages/{feed,post,author,my-posts,editor}/** (the stub .page.ts files become yours), src/shared/post-card/**, src/shared/pagination/**.

**Must NOT touch:** app.routes.ts, app.config.ts, core/**, header/**, styles.css, load-state/**. Request any change from mgr-app-shell. Use the global classes.

**Relies on** the mgr-app-shell interfaces above. Until they land, use a mock ApiService (`Pick<ApiService,…>`) in specs.

**Pages:**
- **Feed (/):**
  - `listPosts(page)` through `app-load-state`.
  - Loading; error with retry; empty "No posts yet", with "Write one" if logged in, else "Sign up".
  - post-card: title links to /posts/<slug>; excerpt; author link /u/<username>; date.
  - Pagination: prev/next routerLinks with ?page=, hidden when totalPages≤1. A page beyond the last shows empty plus a link to page 1.
  - Title "WeBlog".
- **Post (/posts/:slug):**
  - `getPost`; render with `[innerHTML]="post.html"`; show title, author and date.
  - Draft badge when status==='draft'.
  - Edit and Delete only when `auth.isOwner(author.username)`.
  - Title `${title} · WeBlog`.
  - A 404 shows the not-found view, with title "Not found · WeBlog".
- **Author (/u/:username):**
  - getUser + getUserPosts(page): bio, published cards, pagination.
  - Own profile only: an Edit profile toggle and a reactive form (displayName 1–50, bio 0–500).
    - Saving calls updateMe, then AuthService.setUser, then refreshes the display.
    - Field errors show under inputs; submit is disabled while pending.
  - Title `<displayName> · WeBlog`.
- **My posts (/me/posts):**
  - `listMyPosts(page)`: title, Draft/Published badge, updatedAt.
  - Edit (/me/posts/<slug>/edit); View (published posts only).
  - Delete: confirm(), then deletePost and remove the row; reload if the page empties.
  - Empty state: "No posts yet. Write one" → /me/posts/new. Pagination.
- **Editor (/me/posts/new and /me/posts/:slug/edit):**
  - Edit mode loads with getPost(slug) (drafts are returned to their author). A 404 or a non-owner shows not-found.
  - Form: title 1–200, body textarea 0–100000, status draft|published.
  - Save calls create or updatePost. On success go to /posts/<slug> if published, else /me/posts.
  - A 400 shows fields under inputs; a 401 goes to /login?returnUrl=; other errors show a banner. Submit is disabled while pending.
  - Edit mode also has Delete with confirm().
  - No Markdown library; any preview is plain text.

**At 375px:** single column; controls stack or wrap and are at least 40px; titles use `overflow-wrap:anywhere`; pre and table in .post-body scroll inside their own box; the textarea is 100% wide.

**QA specs:**
- Feed: loading, empty, error-retry, populated, paging.
- Post: `[innerHTML]` binds `html`; a `<script>` in html is not executed and is stripped by Angular's sanitizer; draft badge; owner controls hidden when logged out.
- Author: own-profile form calls updateMe; another user's profile has no form.
- My posts: draft badge; delete with a confirm stub (false → no call; true → deletePost and the row is removed).
- Editor: create payload, edit prefill, field errors under inputs, submit disabled while pending.

**Returns:** changed files, test results, ApiService gaps, 375px notes.
