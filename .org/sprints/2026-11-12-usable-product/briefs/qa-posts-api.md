# Brief: qa-posts-api (independent tester, from mgr-posts-api)

APP = /Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application

You see only this brief and these sections of contracts.md:
- "## API" (Conventions, Public shapes, Markdown decision, Slug rules, Validation, the posts and users endpoints, Health)
- "## Data & module layout"

Do NOT read any api/**/*.ts implementation files, other tests, or the other briefs/ files. If the spec is ambiguous, report it; don't read the code to find out.

## Harness (your only contact with the code)
- Import `createApi` from './index' and `openDb` from './db' (relative to api/).
- Build the app with `express().use('/api', createApi({ db: openDb(':memory:') }))`.
- Drive it with supertest. Use `request.agent(app)` for sessions.
- Create users through `POST /api/auth/signup`. Set `process.env['BCRYPT_ROUNDS']='4'` at the top of each file.
- Seed data through the API.
- Use node:test with node:assert/strict.

## Files
- APP/api/posts/posts.qa.test.ts
- APP/api/persistence.qa.test.ts

## Phases
- **Phase 1 (now):** write the tests from the criteria below. Don't run them; the code doesn't exist yet. Return the list of tests per criterion, plus any spec ambiguities as questions.
- **Phase 2 (when told the code is ready):** run `cd APP && node --import tsx --test "api/posts/posts.qa.test.ts" "api/persistence.qa.test.ts"` and report.

## Acceptance criteria
Each criterion needs at least one test, with its ID in the test title.

- **AC-01 CRUD:** create (201 `{post}`), read by slug, list, PATCH (200), DELETE (204, then 404).
- **AC-02 Exact shapes:**
  - PostSummary keys are exactly `id, slug, title, excerpt, status, author{username,displayName}, createdAt, updatedAt, publishedAt`.
  - Post has those keys plus `body` and `html`.
  - A page is `items, page, pageSize=10, total, totalPages`.
  - Timestamps are ISO-8601 UTC. `id` is an integer.
- **AC-03:** with no cookie, each of these returns 401 UNAUTHENTICATED with body `{error:{code,message}}`:
  - POST /api/posts
  - PATCH /api/posts/:slug
  - DELETE /api/posts/:slug
  - GET /api/me/posts
- **AC-04:**
  - Another user's PATCH or DELETE returns 403 FORBIDDEN.
  - A missing slug returns 404 NOT_FOUND on GET, PATCH and DELETE.
  - Anonymous mutations return 401 first.
- **AC-05 Drafts:**
  - GET /posts/:slug on a draft: 404 for anonymous, 404 for another user, 200 for the author.
  - Drafts are absent from /api/posts and /api/users/:username/posts.
  - Drafts are present in /api/me/posts.
- **AC-06 Pagination:**
  - With 25 published posts, pages 1–3 hold 10, 10 and 5. Page 4 returns 200 with empty items.
  - total=25, totalPages=3, newest first by publishedAt, and `page` echoes the request.
  - page=0, page=abc and page=-1 return 400 VALIDATION.
  - Same checks on /me/posts and /users/:u/posts.
- **AC-07 /me/posts:**
  - Includes all statuses, ordered by updatedAt DESC.
  - `status=draft` and `status=published` filter correctly. `status=bogus` returns 400.
  - Shows only your own posts.
- **AC-08 Slugs:**
  - Two posts titled "x" get `x` and `x-2`.
  - The slug is unchanged after a title edit.
  - Slugs are unique across users.
  - `!!!` becomes `post`. "Café Ünïcode" becomes `cafe-unicode`.
  - A long title gives a slug of at most 60 chars with no trailing `-`.
- **AC-09 Sanitization:**
  - These inputs: `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `[x](javascript:alert(1))`, `<iframe src=...>`, `<a href="data:...">`, `<style>`.
  - `html` never contains `<script`, `onerror`, `javascript:`, `<iframe`, `data:` or `<style` (checked case-insensitively).
  - `body` comes back raw and identical to the input.
  - Safe Markdown still renders: h1, strong, a list, a code block, a table, and a link to https://example.com with rel containing noopener and nofollow. An image with an https src is kept.
- **AC-10 published_at and updatedAt:**
  - Publishing at create sets publishedAt. A draft has null.
  - draft→published sets it. published→draft nulls it. published→published keeps it.
  - Any PATCH changes updatedAt. createdAt never changes.
  - The slug is stable. A body change changes `html`.
- **AC-11 Validation** (400 VALIDATION, with error.fields naming the field):
  - Empty or whitespace-only title.
  - A 201-char title (200 chars is OK).
  - A body over 100000 chars (100000 is OK). If the transport limit trips first, report it as an ambiguity.
  - Status missing or "archived". A non-string title.
  - PATCH with `{}`, and PATCH with an invalid status.
  - Titles come back trimmed.
- **AC-12:** `Cache-Control: no-store` on 200, 201, 204, 400, 401, 403 and 404 responses, and on /api/nope.
- **AC-13:**
  - GET /api/nope returns a 404 JSON body with code NOT_FOUND.
  - GET /api/health returns 200 `{ok:true}`.
- **AC-14:**
  - A form-urlencoded or text/plain body on POST /api/posts returns 400 VALIDATION, even when signed in.
  - Logout with no body returns 204.
  - Malformed JSON returns 400 VALIDATION.
  - A body over 100kb returns 400. A 413 counts as FAIL.
- **AC-15 No leaks:**
  - No `email`, `password_hash`, `passwordHash` or `password` anywhere in a posts response.
  - The author object is exactly {username, displayName}.
- **AC-16 Persistence** (persistence.qa.test.ts):
  - Use a temp-file DB in a fresh mkdtemp dir.
  - Sign up and create a post, then close the DB.
  - Reopen the same path with a fresh app. The post reads back identically, and reopening is idempotent.
  - The session cookie from before the restart is still valid (GET /api/auth/me returns the user).
  - Clean up the temp dir.
- **AC-17 Injection:** a title of `'; DROP TABLE posts; --` is stored literally, the table survives, and the slug is safe.
- **AC-18:** when two users create interleaved posts, GET /api/posts?page=1 lists all users' published posts, newest first.

## Phase 2 report
- One row per criterion: `AC-xx | PASS/FAIL | command | output excerpt`.
- Pass/fail counts per file.
- For each FAIL: a minimal repro (expected vs actual) and its AC.
- Ambiguities listed separately.
- Don't fix implementation code. Don't edit any non-QA file.
