# Contracts
(The VPs write the API contract here first: endpoints, payloads, errors, cookie/session behavior, DB schema ownership.)

## Frontend API needs (owner: vp-product)
The operations the UI calls. The CEO reconciles these with "## API". The frontend codes only against "## API", through `ApiService`.

| # | Operation | Used by | Notes |
|---|---|---|---|
| F1 | Get current user (`me`): id, username, displayName, bio, or "not logged in" (200 with null user, or 401) | app init, guards, header | Called once at app start, on server and in browser |
| F2 | Signup (username, email, displayName, password) → logs in, returns user | /signup | Field-level errors needed: duplicate username, duplicate email, validation. Ideally `{error:{code,message,field?}}` |
| F3 | Login (username-or-email, password) → returns user | /login | Generic 401 message |
| F4 | Logout | header | Clears the cookie |
| F5 | List the published feed, page N (10 per page) → `{items, page, pageSize, total}` or `hasMore` | / | Items: id, slug, title, excerpt, publishedAt, author {username, displayName} |
| F6 | Get a post by slug → full post incl. **sanitized rendered HTML** (`bodyHtml`) and raw `bodyMarkdown` (author only, or always) | /posts/:slug, editor | 404 when missing; draft → 404 unless requester is the author |
| F7 | Get a user's public profile by username, plus their published posts (paginated or first N) | /u/:username | 404 when the user is unknown |
| F8 | Update my profile (displayName, bio) | /u/:username (own) or /me/profile | Returns the updated user |
| F9 | List my posts, drafts and published (status, updatedAt) | /me/posts | 401 when logged out |
| F10 | Create post (title, bodyMarkdown, status) → returns post with slug | /me/posts/new | 400 field errors |
| F11 | Update own post by id (title, bodyMarkdown, status) | /me/posts/:id/edit | 403/404 |
| F12 | Delete own post by id | /me/posts, editor | 204 |
| F13 | Get own post for editing by id (raw markdown, incl. drafts) | editor | Can be F6 by slug if ids are not exposed. Prefer by id |

**Requested: the server renders and sanitizes Markdown** (e.g. marked + sanitize-html/DOMPurify on the API) and returns `bodyHtml`. The UI binds `[innerHTML]` to it, with Angular's sanitizer as a second layer. That keeps a single sanitization point covered by API tests (criterion 6), and SSR output is identical. Editor preview, if any, is plain text or uses the same endpoint. No markdown library ships in the client bundle for v1.

**SSR requirements**
- S1: `/posts/:slug`, `/`, and `/u/:username` must render full content on the server for a direct load. Angular's `HttpClient` runs during SSR, so the API must be reachable from the SSR render (same Express process). The frontend uses relative `/api/...` URLs in the browser. On the server, an interceptor rewrites them to an absolute origin (`http://localhost:${PORT}` or the request origin) **and forwards the incoming request's `Cookie` header**. This needs `server.ts` to provide the express `REQUEST` (or the cookie) to the render via a provider. vp-platform owns `server.ts`, so the two sides must agree on a token name: proposed `SSR_REQUEST_COOKIE` (string) and `SSR_ORIGIN` (string), both provided in `commonEngine.render({providers})`.
- S2: Auth state on the server render: F1 is called during SSR with the forwarded cookie, so the header and guards are correct on the first paint (no flash of "Login" for a logged-in user). The guard for `/me/*` therefore works on the server too and redirects to `/login?returnUrl=...`.
- S3: Hydration uses `provideClientHydration(withHttpTransferCacheOptions({includePostRequests:false}))`, the default transfer cache, so the browser does not refetch on hydration. Auth-sensitive GETs (F1, F9) must not leak between users: the transfer cache is per response, so this is fine. The API sets `Cache-Control: no-store` on authenticated responses.
- S4: Unknown post or user → the API returns 404 → the UI shows the NotFound view. Ideally the SSR response status is 404 too (nice-to-have via a `RESPONSE` token, not required).
- S5: `/api/*` is mounted **before** the Angular `**` catch-all and the static handler in `server.ts`.

## Frontend structure (owner: vp-product)
Code lives in `blog-application/src/`, following the existing layout convention (folders under `src/`, not `src/app/`), grouped by area:

```
src/app/            app.component (shell: <app-header/> <main><router-outlet/></main>), app.routes.ts, app.config(.server).ts
src/core/           api.service.ts (ONLY place that knows URLs/DTOs), api.models.ts (DTO types mirroring contracts "## API"),
                    auth.service.ts (signal currentUser, load(), login/signup/logout), auth.guard.ts (authGuard, guestGuard),
                    ssr-api.interceptor.ts (absolute URL + cookie on server), title.strategy.ts
src/shared/         load-state/ (LoadStateComponent: loading | error(retry) | empty(message, action) wrapper), post-card/, pagination/
src/header/         REUSE + extend: logo + nav (Home, Write, My posts, profile, Login/Signup or Logout), mobile-friendly
src/pages/feed/            /                      (paginated feed, ?page=N)
src/pages/post/            /posts/:slug
src/pages/author/          /u/:username           (profile + published posts; inline edit if own)
src/pages/my-posts/        /me/posts              (dashboard)
src/pages/editor/          /me/posts/new, /me/posts/:id/edit
src/pages/login/, src/pages/signup/
src/pages/not-found/
```

**Routes** (`app.routes.ts`, lazy `loadComponent`, `title` on each):
| Path | Component | Guard | Title |
|---|---|---|---|
| `` | FeedPage | none | WeBlog |
| `posts/:slug` | PostPage | none | resolved: `<post title> · WeBlog` |
| `u/:username` | AuthorPage | none | `<displayName> · WeBlog` |
| `me/posts` | MyPostsPage | authGuard | My posts · WeBlog |
| `me/posts/new` | EditorPage | authGuard | New post · WeBlog |
| `me/posts/:id/edit` | EditorPage | authGuard | Edit post · WeBlog |
| `login` | LoginPage | guestGuard (logged in → `/me/posts`) | Log in · WeBlog |
| `signup` | SignupPage | guestGuard | Sign up · WeBlog |
| `**` | NotFoundPage | none | Not found · WeBlog |

- authGuard: awaits `auth.ready` (F1 loaded), then returns `UrlTree('/login?returnUrl=…')`. Login and signup navigate to `returnUrl` (internal paths only) or `/me/posts`.
- Title: a custom `TitleStrategy` appends ` · WeBlog`. Dynamic pages call `Title.setTitle` after data loads, or use a resolver.
- Load states: every data page goes through `LoadStateComponent`, or the same visual pattern: a spinner/"Loading…" text, an error message with a Retry button, an empty message plus a call to action (e.g. "No posts yet. Write one"). A missing post or user renders NotFound content in place.
- Forms: reactive forms, with field errors from API `field` codes shown under inputs. Submit buttons are disabled while pending.
- Drafts: a "Draft" badge everywhere the author sees one. Drafts never appear in the feed or the author page (the API enforces this, and the UI never requests them there).
- Delete: `confirm()` before deleting, then remove the post from the list, or navigate to `/me/posts`.
- Styling: keep the WeBlog logo/header colors. The global tokens (CSS vars) go in `styles.css`. Layout is a single column, max-width ~720px, with a 16px gutter. There is no horizontal scroll at 375px, and the nav wraps or collapses. Tap targets are ≥40px.
- `[innerHTML]="post.bodyHtml"` only for server-sanitized HTML. No `bypassSecurityTrust*`.

**Existing components**
| Existing | Fate |
|---|---|
| header | REUSE (logo); becomes the shell header containing the nav |
| nav | MERGE into header (routerLink, routerLinkActive), then delete |
| login (button), logout | DELETE (their actions move into the header) |
| landing-page, body, logged-in-body | DELETE (replaced by the routes). Reuse any copy/styles from body for the feed hero |
| blog, blog-view | REPLACE with shared/post-card + pages/feed (styles may be carried over) |
| new-blog | REPLACE with pages/editor |
| login.service.ts, blogs.service.ts, blogs.format.ts | DELETE (replaced by core/auth.service, core/api.service, core/api.models) |
| app.component.spec.ts | REWRITE (the stale `title` spec). Each deleted component's spec is deleted with it |

## API (owner: vp-platform)
All endpoints under `/api`, JSON in/out (`Content-Type: application/json`, body limit 100kb). Relative URLs from the browser; same origin, so no CORS.

### Conventions
- **Error body (every 4xx/5xx):** `{ "error": { "code": "<CODE>", "message": "<human text>", "fields"?: { "<field>": "<msg>" } } }`
  Codes: `VALIDATION` (400), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `USERNAME_TAKEN` / `EMAIL_TAKEN` (409), `INTERNAL` (500, no stack in body).
- Unknown `/api/*` route → 404 JSON (never falls through to Angular).
- Timestamps: ISO-8601 UTC strings. IDs: integers.
- **Session cookie:** name `sid`; value = 32 random bytes hex (opaque, server looks it up in `sessions`); flags `HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` (30 days); `Secure` when `NODE_ENV=production` AND `COOKIE_SECURE!=false` (so local docker over http still works). Logout deletes the row and clears the cookie. Expired sessions rejected and lazily deleted.
- **CSRF:** SameSite=Lax + JSON-only bodies (mutating routes reject non-`application/json` with 400/415-as-VALIDATION). No token needed for v1.
- **Auth:** "auth" = valid `sid` required, else 401 `UNAUTHENTICATED`.

### Public shapes
- `PublicUser = { username, displayName, bio, createdAt }` — never `email`, never password hash, never id-leaks beyond this.
- `Me = PublicUser & { id, email }` — only returned to the user themselves.
- `PostSummary = { id, slug, title, excerpt, status, author: { username, displayName }, createdAt, updatedAt, publishedAt|null }` — `excerpt` = first 200 chars of plain text (markdown stripped).
- `Post = PostSummary & { body, html }` — `body` raw Markdown (for the editor), `html` server-sanitized HTML (for display).
- `Page<T> = { items: T[], page, pageSize: 10, total, totalPages }`. Query `?page=N` (1-based, default 1; invalid/<1 → 400 VALIDATION; beyond last → empty items, 200).

### Markdown decision
API returns **both** raw `body` and sanitized `html`. Rendering happens server-side in the API (`marked` → `sanitize-html` allowlist: headings, p, a[href http/https/mailto, rel=noopener nofollow], em/strong, code/pre, ul/ol/li, blockquote, hr, img[src http/https, alt], br, table elements; no `script`, `style`, `iframe`, no `on*` attrs, no `javascript:` URLs). Why: one sanitizer, tested once in API tests (criterion 11), identical output in SSR and browser, zero markdown deps in the Angular bundle. Frontend binds `[innerHTML]="post.html"` (Angular's own sanitizer is a harmless second layer). `html` is computed on write and stored (`body_html` column) — cheap reads.

### Slug rules
`slugify(title)`: lowercase, NFKD + strip diacritics, non `[a-z0-9]` runs → `-`, trim `-`, max 60 chars; empty → `post`. Uniqueness: if taken, append `-2`, `-3`, … Slug is assigned at create and **stays stable on edit** (title change does not change URL). Global unique across all users.

### Validation
- username: `^[a-z0-9_]{3,20}$` (lowercased on input), unique. email: contains `@`, ≤254, lowercased, unique. displayName: 1–50 trimmed. password: 8–200 chars. bio: 0–500.
- title: 1–200 trimmed. body: 0–100000. status: `"draft" | "published"`.

### Endpoints — auth & users (md-identity)
| Method | Path | Auth | Request | 2xx response | Errors |
|---|---|---|---|---|---|
| POST | /api/auth/signup | no | `{username,email,displayName,password}` | 201 `{user: Me}` + sets `sid` (auto-login) | 400 VALIDATION (fields), 409 USERNAME_TAKEN / EMAIL_TAKEN |
| POST | /api/auth/login | no | `{username,password}` (username field also accepts email) | 200 `{user: Me}` + sets `sid` | 400 VALIDATION, 401 INVALID_CREDENTIALS ("Invalid username or password" — same for unknown user and wrong password) |
| POST | /api/auth/logout | no (idempotent) | – | 204, clears cookie | – |
| GET | /api/auth/me | no | – | 200 `{user: Me \| null}` (null when logged out; never 401, so SSR/nav can call freely) | – |
| PATCH | /api/users/me | auth | `{displayName?, bio?}` | 200 `{user: Me}` | 400, 401 |
| GET | /api/users/:username | no | – | 200 `{user: PublicUser}` | 404 |
| GET | /api/users/:username/posts?page= | no | – | 200 `Page<PostSummary>` published only, newest `publishedAt` first | 400, 404 (unknown user) |

### Endpoints — posts (md-api)
| Method | Path | Auth | Request | 2xx response | Errors |
|---|---|---|---|---|---|
| GET | /api/posts?page= | no | – | 200 `Page<PostSummary>` published only, `publishedAt DESC, id DESC` | 400 |
| GET | /api/posts/:slug | no* | – | 200 `{post: Post}` | 404 if missing, or if draft and requester ≠ author (404 not 403, so drafts' existence isn't leaked) |
| GET | /api/me/posts?page=&status= | auth | `status` optional `draft\|published` | 200 `Page<PostSummary>` own posts all statuses, `updatedAt DESC` | 400, 401 |
| POST | /api/posts | auth | `{title, body, status}` | 201 `{post: Post}` | 400, 401 |
| PATCH | /api/posts/:slug | auth | any of `{title, body, status}` | 200 `{post: Post}` | 400, 401, 403 (not author), 404 |
| DELETE | /api/posts/:slug | auth | – | 204 | 401, 403, 404 |

`publishedAt` is set the first time status becomes `published`; reverting to draft sets it to null; re-publishing sets it to now. Ownership check order: 401 → 404 → 403.

### Health
`GET /api/health` → 200 `{ok: true}` (used by Docker HEALTHCHECK).

### SSR → API
SSR makes **real HTTP calls to itself** (loopback), forwarding the browser's cookie:
- Frontend always calls relative URLs `/api/...` via `HttpClient` (with `withFetch()`).
- `server.ts` (owned by vp-platform) passes the Express request into the render: `providers: [{provide: APP_BASE_HREF,...}, {provide: SSR_REQUEST, useValue: {cookie: req.headers.cookie ?? '', origin: \`http://127.0.0.1:${PORT}\`}}]`. Token `SSR_REQUEST` is exported from `src/ssr-request.token.ts` (created by vp-product; `InjectionToken<{cookie:string; origin:string}>`, optional).
- vp-product's HTTP interceptor: if `SSR_REQUEST` is present (server), rewrite `/api/...` to `origin + url` and set the `Cookie` header; in the browser it does nothing (cookie is sent automatically). SSR never sets cookies on the response.
- Use Angular `withHttpTransferCache` (default in provideClientHydration) so the browser doesn't refetch; transfer cache must NOT be used for `/api/auth/me` (include a `includeHeaders`/filter or call it uncached) — vp-product decides.

## Data & module layout (owner: vp-platform)
- **DB file:** env `DATABASE_PATH`, default `./data/weblog.db` (relative to app cwd; dir auto-created). Docker: `/data/weblog.db` on a named volume. `:memory:` allowed (tests). Pragmas: `journal_mode=WAL`, `foreign_keys=ON`.
- **Schema** (created idempotently at startup via `CREATE TABLE IF NOT EXISTS`, plus `PRAGMA user_version` for future migrations; owner md-api):
  - `users(id INTEGER PK, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`
  - `sessions(id TEXT PK, user_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)` + index on `expires_at`
  - `posts(id INTEGER PK, author_id INTEGER NOT NULL REFERENCES users ON DELETE CASCADE, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, body_html TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), created_at, updated_at TEXT NOT NULL, published_at TEXT)` + index `(status, published_at DESC)` and `(author_id)`
- **Code layout** (`blog-application/api/`, TypeScript, no Angular imports):
  - `api/db.ts` — `openDb(path): Database` (schema + pragmas). md-api.
  - `api/errors.ts` — `ApiError` class + `errorHandler` middleware + `notFound`. md-api.
  - `api/markdown.ts` — `renderMarkdown(md): string` (marked + sanitize-html), `slugify`, `excerpt`. md-api.
  - `api/auth/*` — password hashing (bcrypt cost 12, 10 in tests via env `BCRYPT_ROUNDS`), session store, `loadUser` middleware (sets `req.user`), `requireAuth`, routes for `/auth` + `/users`. md-identity.
  - `api/posts/*` — posts routes. md-api.
  - `api/index.ts` — `createApi({ db }): express.Router` wiring: `express.json()`, cookie parsing (`cookie-parser`), `loadUser`, routers, `notFound`, `errorHandler`. md-api assembles; md-identity supplies its routers/middleware.
  - `api/**/*.test.ts` — node:test + supertest.
- **Mount in server.ts** (mgr-delivery edits, vp-platform reviews): `server.use('/api', createApi({ db: openDb(process.env.DATABASE_PATH ?? 'data/weblog.db') }))` **before** the static and Angular handlers. `npm start` = `node dist/<name>/server/server.mjs` (dev stays on `npm run dev` = `ng serve`). `better-sqlite3` and `bcrypt` must be listed in `angular.json` → `build.options.externalDependencies` (native modules can't be bundled). Prefer `bcryptjs` if native bcrypt causes build pain (still bcrypt-format hashes).
- **Test isolation:** each test file builds `express().use('/api', createApi({ db: openDb(':memory:') }))` and drives it with supertest — no Angular build, no shared file. Persistence-across-restart test: open a temp file in `os.tmpdir()`, write, close, reopen, read. Runner: `node --import tsx --test "api/**/*.test.ts"` (`tsx` devDep).
- **Seed:** `scripts/seed.ts` (`npm run seed`): idempotent; user `demo` / `demo@example.com` / password `demo-password` / display "Demo Writer", 3 published + 1 draft posts. Uses `openDb` + same hash/markdown helpers.

## Reconciliation (owner: ceo), overrides "Frontend API needs" where they differ
- Field names follow "## API": post Markdown is `body`, sanitized HTML is `html` (not bodyMarkdown/bodyHtml). Errors use `fields` (map field→msg), not `field`.
- Pagination: use `totalPages` (no `hasMore`).
- Editing is by **slug**, not id: editor route `/me/posts/:slug/edit`; load via `GET /api/posts/:slug` (returns drafts to their author); save via `PATCH /api/posts/:slug`. F11/F13 map to these.
- SSR token: single `SSR_REQUEST` `{cookie, origin}` in `src/ssr-request.token.ts`. **Already created by the CEO**, so both teams import it; no one else creates it.
- `createApi` sets `Cache-Control: no-store` on **all** `/api` responses (simplest correct rule).
- `/api/auth/me` is excluded from the HTTP transfer cache (vp-product team implements the filter).
- Password hashing uses **bcryptjs** (pure JS, bcrypt-format hashes); no native bcrypt. Only `better-sqlite3` goes in `angular.json` externalDependencies.
- Dependencies already installed by the CEO: better-sqlite3, bcryptjs, marked, sanitize-html, cookie-parser (+ types), supertest, tsx. Don't add others without recording it in decisions.md; mgr-delivery owns package.json scripts and the name.
- Stale `app.component.spec.ts` is rewritten by vp-product's team (mgr-app-shell).
- A real HTTP 404 status for SSR not-found pages is nice-to-have, not required.
