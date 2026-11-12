# Briefs from mgr-posts-ui: eng-reader and eng-editor
Read the COMMON section plus the section for your role. Ignore the other role's section except where it says what you consume.

## COMMON
**Project.** WeBlog: Angular 18 (standalone components, signals, reactive forms) with SSR.
- App root: `/Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application`. Run npm/npx from here.
- `SRC` means the `src/` folder inside the app root.
- Org memory: `/Users/quantumapple/Desktop/Culture/sample/blog-application/.org/MEMORY.md`.
- Contract: `.org/sprints/2026-11-12-usable-product/contracts.md`, sections "## API" and "## Reconciliation".
- Do NOT edit anything under `.org/`.

### Hard rules
- **Files you must not touch:** `app.routes.ts`, `app.config*.ts`, `core/**`, `header/**`, `styles.css`, `shared/load-state/**`, `pages/{login,signup,not-found}/**`, `server.ts`, `api/**`, `package.json`, `angular.json`, `ssr-request.token.ts`. If you need a change in one of these, report it to mgr-posts-ui. Don't work around it.
- **Data access:** no HttpClient and no URLs. Use only ApiService and AuthService.
- **No** `bypassSecurityTrust*`, no new dependencies, no Markdown library.
- **Styling:** use the global classes `.container .btn .btn-primary .btn-danger .btn-link .field .field-error .badge .badge-draft .card .page-title .muted .stack` and the tokens `--color-*`, `--space-*`, `--radius`. Don't redefine them. Component CSS is for page-specific layout only.
- **Field names:** `body`/`html` (never `bodyMarkdown`/`bodyHtml`), `fields` (never `field`), `totalPages` (no `hasMore`). Editing is by slug.

### Readiness gate
Start only when all of these exist under SRC:
- `core/api.models.ts`
- `core/api.service.ts`
- `core/auth.service.ts`
- `shared/load-state/load-state.component.ts`
- `pages/{feed,post,author,my-posts,editor}/<x>.page.ts`

Check with `ls SRC/core SRC/shared/load-state SRC/pages/*/` and `grep -n "export" SRC/core/*.ts SRC/shared/load-state/*.ts`. Code against the published signatures and report any difference from the list below.

### Expected interfaces
- **ApiService** (`providedIn: 'root'`; every method returns an Observable):
  - `me()`, `signup`, `login`, `logout`
  - `updateMe({displayName?, bio?}): Me`
  - `getUser(username): PublicUser`
  - `getUserPosts(username, page=1): Page<PostSummary>`
  - `listPosts(page=1)`
  - `getPost(slug): Post`
  - `listMyPosts(page=1, status?)`
  - `createPost(PostInput): Post`
  - `updatePost(slug, Partial<PostInput>): Post`
  - `deletePost(slug): void`
- **Models:**
  - `PublicUser`, `Me`
  - `PostSummary = {id, slug, title, excerpt, status, author:{username, displayName}, createdAt, updatedAt, publishedAt|null}`
  - `Post = PostSummary & {body, html}`
  - `Page<T> = {items, page, pageSize, total, totalPages}`
  - `PostInput = {title, body, status: 'draft'|'published'}`
- **Errors:** `class ApiError {status, code, message, fields?}`, exported from `core/api.service.ts`.
- **AuthService:** `currentUser: Signal<Me|null>`, `ready: Promise<void>`, `setUser(Me)`, `isOwner(username): boolean`.
- **Load state component:** `<app-load-state [state]="'loading'|'error'|'empty'|'ready'" [errorMessage] [emptyMessage] [emptyActionLabel] [emptyActionLink] (retry)>`.
  - It also exports `type LoadState` and projects the ready content.
- **Not-found view:** `NotFoundViewComponent` (selector `app-not-found-view`) from `src/pages/not-found/not-found.page.ts`. Use it in place for 404s.
- **Routes** bind inputs by name: `slug`, `username`, `page`.
  - `page` arrives as `string|undefined`. Parse it as `Math.max(1, parseInt(page ?? '1', 10) || 1)`.
  - Pages must reload when an input changes. Use `input()` signals with effect/computed/toObservable and switchMap. Don't read the input once in ngOnInit.
- **Page exports:** `FeedPage`, `PostPage`, `AuthorPage`, `MyPostsPage`, `EditorPage`. Replace the stub files in place and keep these export names.

### Page conventions
- Each page has a `state` signal of type `LoadState`.
- Loading flow: set 'loading', then 'ready'. Use 'empty' when there are no items, and 'error' on failure. Retry calls the loader again.
- Avoid stale overwrites: use switchMap on an input-driven stream, plus takeUntilDestroyed.
- **Titles:** dynamic pages call `Title.setTitle(...)` with the full string, including " · WeBlog". Set it after the data loads, and make sure this works under SSR.
- Cards use `.card`. Dates use the `date` pipe, from `publishedAt ?? createdAt`.

### 375px rules
- Single column, no horizontal scroll.
- Every control is at least 40px tall. Use `.btn`; for a bare link acting as a control, use `min-height:40px; display:inline-flex; align-items:center`.
- Titles get `overflow-wrap:anywhere`.
- Action rows: `display:flex; flex-wrap:wrap; gap`.
- No fixed widths.

### Your specs
- Only small smoke specs (`<name>.spec.ts`), with a mocked ApiService: jasmine spies returning `of(...)` or `throwError(() => new ApiError(...))`.
- Never create, edit or read `*.qa.spec.ts`. Those belong to qa-posts-ui.

### Definition of done
- `npx ng build` passes.
- `npx ng test --watch=false --browsers=ChromeHeadless` passes.
- If Karma needs `--no-sandbox`, report it. Don't edit the config.
- Failing QA specs aren't yours to change. Report them with your analysis.

### Return to mgr-posts-ui
- Files (absolute paths).
- Build and test results.
- Signature differences from the list above.
- Gaps or requests for mgr-app-shell.
- 375px notes.
- Deviations from this brief, with reasons.

## eng-reader
**Files you own:**
- `SRC/shared/post-card/post-card.component.*`
- `SRC/shared/pagination/pagination.component.*`
- `SRC/pages/feed/feed.page.ts` (plus spec and css)
- `SRC/pages/post/post.page.ts` (plus spec and css)
- `SRC/pages/author/author.page.ts` (plus spec and css)

### PostCardComponent (`app-post-card`)
- Required input: `post: PostSummary`.
- Title is a routerLink to `/posts/<slug>`.
- Shows the excerpt.
- Author is a routerLink to `/u/<username>`, with `displayName` as the link text.
- Shows the date.
- Show `.badge .badge-draft` "Draft" only when the status is draft.
- Wrap everything in `.card`. The title gets `overflow-wrap:anywhere`.

### PaginationComponent (`app-pagination`)
- Inputs: `page: number`, `totalPages: number`.
- When `totalPages <= 1`, render nothing.
- Otherwise render `<nav aria-label="Pagination">` containing:
  - "Previous", only when `page > 1`
  - "Next", only when `page < totalPages`
  - the text "Page X of Y"
- Links: `routerLink="."` with `[queryParams]="{page: n}"`. Always include `page`, even for page 1.
- Controls are at least 40px tall, and the row wraps.

### FeedPage (`/`)
- Input `page`. Calls `listPosts(pageNum)` and shows the result through `<app-load-state>`.
- **Empty, page 1:** "No posts yet."
  - Logged in: a "Write one" action to /me/posts/new.
  - Logged out: a "Sign up" action to /signup.
- **Beyond the last page** (pageNum > 1, no items): "No posts on this page." with a "Go to page 1" action to `/`.
- **Error:** show the error message, falling back to "Could not load posts." Retry reloads.
- **Ready:** a `.stack` of post cards, then pagination.
- Heading: `.page-title` "Latest posts".
- Title: `Title.setTitle('WeBlog')`.

### PostPage (`/posts/:slug`)
- Input `slug`. Calls `getPost(slug)`.
- **404:** show `<app-not-found-view>` in place and set the title 'Not found · WeBlog'.
- **Other errors:** error state with Retry.
- **Ready:** an `<article>` containing:
  - `h1.page-title` with the title
  - the byline "By <a routerLink=/u/username>displayName</a> · <date>"
  - a Draft badge when the status is draft
  - `<div class="post-body" [innerHTML]="post.html"></div>`
- Never process `html` yourself, and never bypass sanitization.
- **Owner controls**, shown only when `auth.isOwner(post.author.username)`:
  - "Edit", linking to /me/posts/<slug>/edit.
  - "Delete" (`.btn-danger`).
    - First: `if (!confirm('Delete this post?')) return;` (call `confirm` directly so a spec can stub `window.confirm`).
    - Then `deletePost(slug)`, then navigate to /me/posts.
    - Disable the button while the request is pending. Show errors inline.
- Title: `${post.title} · WeBlog`.
- **CSS** (scoped; use `::ng-deep` only if needed):
  - `.post-body img {max-width:100%; height:auto}`
  - `.post-body pre`, `.post-body table`: `display:block; max-width:100%; overflow-x:auto`
  - `.post-body {overflow-wrap:anywhere}`
  - Sensible styling for blockquote and code.

### AuthorPage (`/u/:username`)
- Inputs `username` and `page`.
- Calls `getUser(username)` and `getUserPosts(username, pageNum)`. Don't let a stale response overwrite a newer one.
- **404 from either call:** show the not-found view in place, with the title 'Not found · WeBlog'.
- **Ready:**
  - h1 with `displayName`, then `@username`.
  - The bio, or `.muted` "No bio yet." when it's empty.
  - Published post cards, then pagination.
  - Empty list: "No published posts yet."
  - Beyond the last page: same handling as the feed.
- **Own profile** (`auth.isOwner(username)`; re-evaluate when the logged-in user changes):
  - An "Edit profile" toggle opens an inline reactive form.
    - `displayName`: required, 1–50 characters after trimming.
    - `bio`: textarea, 0–500 characters.
    - Prefill both fields.
  - Save flow: `api.updateMe({displayName, bio})`, then `auth.setUser(me)`, then update the displayed user, close the form, and update the title.
  - **Errors:**
    - A 400 with `fields.displayName` or `fields.bio`: show it in `.field-error` under that input.
    - Client-side validator messages appear there too, once the field is touched.
    - Any other error: a `role=alert` banner.
  - Disable submit while pending or while the form is invalid. Cancel resets the form and closes it.
  - Labels use for/id. Inputs are 100% wide.
- Title: `${displayName} · WeBlog`.
- Never render an email address.

### Smoke specs
- post-card renders correctly.
- pagination: hidden when `totalPages <= 1`, otherwise prev/next carry the right queryParams.
- feed: ready, empty and error states.
- post page: `innerHTML` binding works; owner controls appear.
- author page: the form exists only for the owner.

## eng-editor
**Files you own:**
- `SRC/pages/my-posts/my-posts.page.ts` (plus spec and css)
- `SRC/pages/editor/editor.page.ts` (plus spec and css)

You do NOT own post-card or pagination. For pagination, import `PaginationComponent` (`app-pagination`, inputs `page` and `totalPages`) from `src/shared/pagination/pagination.component` once eng-reader has created it. Until then, stub it in your spec only. Don't use post-card on my-posts.

### MyPostsPage (`/me/posts`)
- Input `page`. Calls `listMyPosts(pageNum)`.
- **Rows:** each row is a `.card`, laid out as a single-column `.stack`, showing:
  - the title (`overflow-wrap:anywhere`)
  - a "Published" badge (`.badge`) or a "Draft" badge (`.badge .badge-draft`)
  - `updatedAt` (`date:'medium'`)
- **Row actions:**
  - "Edit", linking to /me/posts/<slug>/edit.
  - "View", linking to /posts/<slug>. Published posts only.
  - "Delete" (`.btn-danger`).
- **Delete flow:**
  1. `if (!confirm('Delete "<title>"?')) return;`. A false answer makes no API call.
  2. Call `deletePost(slug)`.
  3. On success, remove the row and decrement the total.
     - Page now empty and pageNum > 1: navigate to `?page=pageNum-1`.
     - Page now empty on page 1: switch to the empty state.
     - Otherwise, if later pages exist, reload the current page.
  4. Disable that row's Delete button while the request is pending.
  5. On failure: show a `role=alert` message and keep the row.
- **Empty:** "No posts yet." with a "Write one" action to /me/posts/new.
- **Error:** Retry. On a 401, navigate to `/login?returnUrl=%2Fme%2Fposts`.
- Heading: "My posts", plus a "New post" link to /me/posts/new. Pagination below the list.
- Title: 'My posts · WeBlog'.

### EditorPage (`/me/posts/new` and `/me/posts/:slug/edit`)
- Input `slug`. When it's undefined, the page is in create mode.
- **Edit mode load:** `getPost(slug)`.
  - 404: show the not-found view, with the title 'Not found · WeBlog'.
  - `!auth.isOwner(post.author.username)`: show the same not-found view. Never allow editing someone else's post.
  - Otherwise patch title, body and status into the form.
  - Other errors: error state with Retry.
- **Create mode:** goes straight to ready, with an empty form. Status defaults to 'draft'.
- **Reactive form:**
  - `title`: required, maxLength 200, must be non-empty after trimming.
  - `body`: textarea, maxLength 100000, may be empty.
  - `status`: select or radio buttons, Draft / Published.
  - Labels are bound to their controls. Inputs are 100% wide. The textarea has at least 12 rows and `resize:vertical`.
  - Hint text: "Markdown is supported. It is rendered on the server." No Markdown preview, and no Markdown library.
- **Save:**
  - Create mode: `createPost({title: title.trim(), body, status})`.
  - Edit mode: `updatePost(slug, {title: title.trim(), body, status})`.
  - On success: go to /posts/<post.slug> if the post is published, otherwise to /me/posts.
  - Disable submit while pending or invalid, and show "Saving…" while pending.
- **Save errors:**
  - 400 with `fields`: show each message under its input (`.field-error`) for title, body or status. Clear a field's server error when that field is edited. Any field without a matching input goes into the banner.
  - 401: `router.navigateByUrl('/login?returnUrl=' + encodeURIComponent(router.url))`.
  - Anything else: a `role=alert` banner with `error.message`, and submit is re-enabled.
- **Edit mode extras:** a "Delete" button.
  - `confirm('Delete this post?')`, then `deletePost(slug)`, then navigate to /me/posts.
  - Disabled while pending. Errors go to the banner. A false confirm makes no call.
- Cancel links to /me/posts. The button row wraps.
- Title: leave the route's static title ('New post · WeBlog' / 'Edit post · WeBlog') as it is.
- No leave-page guard is needed.

### Smoke specs
- my-posts: rows render, badges are correct, delete respects a stubbed confirm.
- editor: create sends the right payload shape; edit prefills the form.
