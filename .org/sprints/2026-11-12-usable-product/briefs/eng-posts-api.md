# Brief: eng-posts-api (from mgr-posts-api)

APP = /Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application

## Common rules
- Do NOT edit .org/, server.ts, package.json, angular.json, api/auth/**, api/users/**, src/.
- No new deps.
- Strict TS: use `process.env['X']` (bracket form).
- No Angular imports.
- Never create or edit `*.qa.test.ts`.

## Files you own (APP/api/)
- posts/repo.ts
- posts/routes.ts
- posts/index.ts
- posts/test-helpers.ts (test-only)
- posts/*.test.ts (not *.qa.test.ts)
- index.ts

## Start condition
These three files must exist:
- api/db.ts (openDb)
- api/errors.ts (ApiError, notFound, errorHandler)
- api/markdown.ts (renderMarkdown, slugify, excerpt)

Check with `ls api/db.ts api/errors.ts api/markdown.ts`, then `node --import tsx -e "import('./api/db.ts').then(m=>m.openDb(':memory:'))"`. Don't write your own copies of these files.

## api/posts/index.ts (shared exports; md-identity depends on these)
```ts
export type Page<T> = { items: T[]; page: number; pageSize: 10; total: number; totalPages: number }
export function listPublishedPostsByAuthor(db, authorId: number, page: number): Page<PostSummary>
export function parsePage(query: { page?: unknown }): number
export { postsRouter } from './routes'
```
- Also re-export the PostSummary and Post types.
- parsePage:
  - undefined → 1.
  - Anything else must match `/^\d+$/` and be ≥ 1. Otherwise throw `ApiError.validation({page:'Must be an integer >= 1'})`.
  - Arrays → 400.
- **Note:** eng-auth-api's `api/users` code imports `listPublishedPostsByAuthor` and `parsePage` through a seam module. Keep these names and signatures exactly.

## api/posts/repo.ts
**Operations:** createPost, findBySlug, updatePost, deletePost, `listPublished({authorId?, page})`, `listByAuthor(authorId, {status?, page})`.

**Serializers:** toPostSummary and toPost.
- PostSummary = `{id, slug, title, excerpt, status, author:{username, displayName}, createdAt, updatedAt, publishedAt|null}`.
- Post = PostSummary & `{body, html}`.
- Never include author id, email or password_hash.
- excerpt = `excerpt(body)`.

**Slugs:**
- base = slugify(title).
- If the slug is taken, append `-2`, `-3` and so on.
- Insert inside a transaction. On a UNIQUE(slug) error, retry with the next suffix (bounded loop).

**listPublished:**
- `WHERE status='published' ORDER BY published_at DESC, id DESC LIMIT 10 OFFSET (page-1)*10`.
- total comes from COUNT.
- totalPages = ceil(total/10); 0 when there are no posts.

**listByAuthor:** order by `updated_at DESC, id DESC`, with an optional status filter.

**SQL:** prepared statements with bound parameters only.

## api/posts/routes.ts: `postsRouter(db)`, mounted at `/`
**GET /posts?page=** → `Page<PostSummary>`. An invalid page → 400.

**GET /posts/:slug** → `{post}`.
- A draft is 404 unless `req.user?.id` matches author_id.
- A missing post → 404.

**GET /me/posts?page=&status=**
- requireAuth. Returns your own posts in every status.
- status must be draft or published; anything else → 400 with fields.status.

**POST /posts** (requireAuth)
- Validate title (trimmed, 1–200), body (string, 0–100000, stored unaltered) and status (draft or published, required).
- Collect every field error into one `ApiError.validation(fields)`.
- On success → 201 `{post}`.
- Set body_html = renderMarkdown(body); published_at = now if the post is published; created_at = updated_at = now.

**PATCH /posts/:slug** (requireAuth)
- Check order: 401 → 404 → 403 → 400.
- At least one of title, body, status. `{}` or only unknown fields → 400.
- The slug never changes.
- A body change recomputes html.
- Status transitions:
  - draft→published: set published_at = now.
  - published→draft: set published_at = null.
  - published→published: keep published_at.
  - draft→draft: published_at stays null.
- Always bump updated_at. If the new value is ≤ the old one, use the old value + 1ms.

**DELETE /posts/:slug** (requireAuth)
- Check order: 401 → 404 → 403, then 204 with an empty body.

**Errors:** throw ApiError. Make sure errors reach `next` (check the installed express version; with v4, use try/catch and call `next(e)`).

**Timestamps:** `new Date().toISOString()`.

## api/index.ts: `createApi({db}): express.Router`, in this exact order
1. Middleware: `res.set('Cache-Control','no-store')`.
2. `express.json({limit:'100kb'})`.
3. `cookieParser()`.
4. JSON content-type guard:
   - Applies to POST, PATCH and PUT that have a non-empty body (content-length > 0 or a transfer-encoding header).
   - If `!req.is('application/json')`, call `next(ApiError.validation({_:'Content-Type must be application/json'}, 'Content-Type must be application/json'))`.
   - Requests without a body are exempt (logout, DELETE).
5. `GET /health` → `{ok:true}`.
6. `loadUser(db)`.
7. `/auth` → `authRouter(db)`.
8. `/users` → `usersRouter(db)`.
9. `/` → `postsRouter(db)`.
10. `notFound`.
11. `errorHandler`.

## Auth
**Production imports:** only from `./auth` (`api/auth/index.ts`), which exports loadUser, requireAuth, authRouter and usersRouter. `req.user = {id, username, email, displayName, bio, createdAt}`.

**If api/auth/index.ts doesn't exist yet:**
- Create api/posts/test-helpers.ts (test-only):
  - a stubAuth that reads the `x-test-user` header and sets req.user;
  - a requireAuth stub that returns 401.
- Build a dev test app that wires the stub directly in front of postsRouter. Do not put the stub in index.ts.
- routes.ts may import requireAuth through a single `// TEMP` line, which you must remove before handback.

**Production files must never import test-helpers.** Check with `grep -rn test-helpers api --include=*.ts | grep -v "\.test\.ts"`; only test-helpers.ts itself may appear.

**Before handback:**
- index.ts uses the real `./auth`.
- Re-point your tests at createApi with real signup and login (supertest agent).

**Typing:** don't redeclare the global `req.user` augmentation if api/auth already declares it.

## Your tests (api/posts/*.test.ts)
- Repo/unit level:
  - slug collisions and the retry on a race
  - pagination math
  - the status-transition table
  - serializers leak nothing
- Route level, through createApi:
  - happy paths
  - the 401 → 404 → 403 → 400 ordering

## Done when
- `npx tsc --noEmit -p tsconfig.app.json` is clean, or a targeted strict tsc if tsconfig doesn't include api/ (report which you ran).
- `node --import tsx --test "api/**/*.test.ts"` is green for your files. QA files aren't yours; report their state but don't fix them.

## Return
- Files, each with a one-line description, and exported signatures.
- Test output with counts per file.
- Choices you made: the parsePage signature, totalPages when empty, timestamp tie handling.
- Any deviations from this brief.
- Output of the test-helpers grep.
- Whether the real api/auth was used.
