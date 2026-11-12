# Brief: mgr-posts-api (from md-api, incl. md-api addendum + CEO rulings)

**Goal.** Deliver a persistent SQLite module and the posts endpoints exactly as specified in contracts.md. The sections that apply are "## API" (posts rows, Conventions, Slug rules, Validation, Markdown decision), "## Data & module layout" and "## Reconciliation". "## API" naming wins.
**APP root:** /Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application/. Code goes in APP/api/.
**Do NOT edit:** .org/, server.ts, package.json, angular.json, api/auth/**, api/users/**, src/. No new deps.
**Owned files:** api/db.ts, api/errors.ts, api/markdown.ts, api/index.ts, api/posts/**, and their *.test.ts.
**Toolchain:** tsconfig.app.json compiles server.ts and everything it imports, including api/. So api code must compile under strict and noPropertyAccessFromIndexSignature: write `process.env['X']`, not `process.env.X`. @types/node is v18.

## Work packages
**WP1 (eng-data-layer, FIRST; ship it immediately, because md-identity depends on it)**
- api/db.ts: `openDb(path: string): Database` using better-sqlite3.
  - Auto-create the parent directory, except for `:memory:`.
  - Pragmas `journal_mode=WAL` and `foreign_keys=ON`.
  - users, sessions and posts tables plus indexes exactly as in contracts.md, created with CREATE TABLE IF NOT EXISTS. Reopening must be idempotent.
  - `PRAGMA user_version = 1` as a migration scaffold.
  - Export the `Database` type.
- api/errors.ts: `class ApiError extends Error`, with the constructor **exactly** `new ApiError(status: number, code: Code, message: string, fields?: Record<string,string>)`.
  - Static helpers `validation(fields, message?)`, `unauthenticated()`, `forbidden()` and `notFound()`, as thin wrappers over that constructor.
  - `Code` union: VALIDATION, UNAUTHENTICATED, INVALID_CREDENTIALS, FORBIDDEN, NOT_FOUND, USERNAME_TAKEN, EMAIL_TAKEN, INTERNAL.
  - `notFound` middleware: JSON 404 for unknown /api routes.
  - `errorHandler` always emits `{error:{code,message,fields?}}`:
    - a body-parser JSON syntax error → 400 VALIDATION;
    - a body over 100kb → 400 VALIDATION (say which status you chose);
    - unknown errors → 500 INTERNAL with a generic message, `console.error`, and no stack in the body.
- Tests: schema and pragmas, idempotent reopen, user_version.

**WP2 (eng-data-layer)**
- api/markdown.ts:
  - `renderMarkdown(md): string`: marked, then sanitize-html with the contracts.md allowlist.
    - Tags: headings, p, a, em, strong, code, pre, ul, ol, li, blockquote, hr, img, br, table elements.
    - `a[href]` allows http, https and mailto; `img[src]` allows http and https.
    - Links get `rel="noopener nofollow"`.
    - Stripped: on* attributes, style, script, iframe, and `javascript:` and `data:` URLs.
    - Raw HTML inside the Markdown is sanitized too.
  - `slugify(title)` follows the contract rules exactly. Max 60 chars, with no trailing `-` after truncation. An empty result becomes `post`.
  - `excerpt(markdown: string): string` (named export): the first 200 characters of plain text, with whitespace collapsed and no tags or entities leaking.
- Unit tests, including `""`, `"!!!"`, `"Café Ünïcode"` and a title longer than 60 chars.

**WP3 (eng-posts-api, after WP1 and WP2)**
- api/posts/repo.ts:
  - createPost, findBySlug, updatePost, deletePost
  - listPublished({authorId?, page}), listByAuthor(authorId, {status?, page})
  - serializers toPostSummary and toPost
  - unique-slug generator (-2, -3, …; handle a race by retrying inside a transaction)
- api/posts/routes.ts: `postsRouter(db)`.
- **Shared exports (CEO ruling; md-identity must use these for /api/users/:username/posts):** api/posts/index.ts re-exports:
  - `listPublishedPostsByAuthor(db, authorId, page): Page<PostSummary>`
  - `parsePage(query): number` (throws `ApiError.validation` when the value is not an integer or is below 1)
  - the `Page<T>` type
- Behaviour:
  - **GET /api/posts?page=**: published posts only, ordered `published_at DESC, id DESC`, 10 per page, with total and totalPages.
    - A page beyond the last returns 200 with empty items.
    - An invalid page, or one below 1, returns 400.
  - **GET /api/posts/:slug**: public. A draft is 404 unless req.user is its author. Returns `{post}`.
  - **GET /api/me/posts?page=&status=**: requireAuth. Your own posts in every status, ordered `updated_at DESC`. An invalid status returns 400.
  - **POST /api/posts**: requireAuth.
    - Validates title (1–200, trimmed), body (string, 0–100000) and status (draft or published, required).
    - Returns 201 `{post}`.
    - Stores body_html; sets published_at = now if the post is published; derives the slug.
  - **PATCH /api/posts/:slug**: any subset of fields, but at least one (otherwise 400).
    - Check order: 401 → 404 → 403 → 400.
    - The slug never changes. A body change recomputes html.
    - draft→published sets published_at = now; published→draft sets it to null; published→published keeps it.
    - Always bumps updated_at.
  - **DELETE /api/posts/:slug**: 401 → 404 → 403 → 204.
  - Timestamps are ISO-8601 UTC. `author` is `{username, displayName}` only.

**WP4 (eng-posts-api)** api/index.ts: `createApi({db}): express.Router`. Middleware order:
1. Cache-Control: no-store on every response
2. express.json({limit:'100kb'})
3. cookieParser()
4. JSON content-type guard: POST, PATCH and PUT with a non-empty body that is not application/json → 400 VALIDATION. Bodyless requests are exempt (logout, DELETE).
5. GET /health → `{ok:true}`
6. loadUser(db)
7. /auth → authRouter(db)
8. /users → usersRouter(db)
9. postsRouter(db) at `/`
10. notFound
11. errorHandler

All auth imports come from api/auth/index.ts: `loadUser(db)`, `requireAuth`, `authRouter(db)`, `usersRouter(db)`, with `req.user = {id, username, email, displayName, bio, createdAt}`. Until api/auth exists, use a test-only stub (for example `api/posts/test-helpers.ts`, keyed on an `x-test-user` header). Production code must never import it, and index.ts must use the real api/auth before handback.

**WP5 (qa-posts-api, independent)** Black-box tests with supertest through `createApi({db: openDb(':memory:')})`, written from contracts.md only. Files: api/posts/posts.qa.test.ts and api/persistence.qa.test.ts. Coverage:
- CRUD, plus the exact PostSummary and Post shapes.
- 401 on every mutating route and on /me/posts.
- 403 on someone else's PATCH or DELETE; 404 on a missing slug.
- Drafts hidden from anonymous and other users (404), visible to the author, absent from /posts and /users/:u/posts.
- Pagination: 25 published posts → page sizes 10/10/5/empty, total=25, totalPages=3, newest first. page=0, page=abc and page=-1 → 400.
- Slugs: x then x-2, stable on edit, unique across users, `!!!` → `post`.
- Sanitization: `<script>`, `onerror`, `javascript:` links and `<iframe>` are stripped from html while body stays raw; safe Markdown still renders, including link rel and tables.
- published_at semantics, and updatedAt changing.
- Validation 400s with error.fields: empty title, 201-char title, body over 100000, bad status, PATCH with `{}`.
- Cache-Control: no-store on everything, including errors. `/api/nope` returns a JSON 404.
- A form-encoded or text body on POST /api/posts → 400 VALIDATION. Logout with no body → 204.
- Persistence: a temp-file DB survives close and reopen.
- No email, password_hash or passwordHash in any posts response.

**Order:** WP1 (notify immediately) → WP2 alongside it → WP3 → WP4 → WP5. QA writes its tests in parallel and runs them after WP4.

## mgr-posts-api must return
1. A file list, each with a one-line description, and the exported signatures.
2. `cd APP && node --import tsx --test "api/**/*.test.ts"`: the output, green, with counts per file. Report QA results separately from engineer results.
3. A coverage map: criteria 4, 5, 6 (API), 10 and 11 (part), each mapped to a named test.
4. Deviations and assumptions, listed explicitly.
5. Confirmation that index.ts uses the real api/auth, with no stub in production code.
6. Known gaps.
