# Brief: eng-data-layer (from mgr-posts-api)
APP = /Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application

**Common rules**
- Do NOT edit .org/, server.ts, package.json, angular.json, api/auth/**, api/users/** or src/.
- No new deps. Already installed: better-sqlite3, marked, sanitize-html, cookie-parser, supertest, tsx, bcryptjs.
- Strict TS with noPropertyAccessFromIndexSignature: write `process.env['X']`. @types/node is v18. No Angular imports.
- Tests: `cd APP && node --import tsx --test "api/**/*.test.ts"`, using node:test + supertest.
- Never create or edit `*.qa.test.ts` files.

**Files you own** (all in APP/api/): db.ts, errors.ts, markdown.ts, db.test.ts, errors.test.ts, markdown.test.ts.

**Ship WP1 first.** md-identity's team is blocked on db.ts and errors.ts. Once both compile and their tests pass, STOP and return a short "WP1 done" report (files, signatures, test output). The CEO will tell you when to continue with WP2. Don't batch WP1 with WP2.

## WP1a: api/db.ts
```ts
import Database from 'better-sqlite3';
export type { Database }; // type = Database.Database
export function openDb(path: string): Database.Database
```
- If path !== ':memory:', call mkdirSync(dirname(path), {recursive:true}).
- Set pragmas `journal_mode = WAL` and `foreign_keys = ON`.
- Use CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
- Set `PRAGMA user_version = 1`, but only when it's currently 0. Add a comment marking this as the migration hook.
- Reopening is idempotent and the data survives.

Schema, exactly:
- `users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL, created_at TEXT NOT NULL)`
- `sessions(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at TEXT NOT NULL)`, plus an index on sessions(expires_at)
- `posts(id INTEGER PRIMARY KEY, author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, body_html TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','published')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT)`, plus indexes on posts(status, published_at DESC) and posts(author_id)

## WP1b: api/errors.ts
```ts
export type Code = 'VALIDATION'|'UNAUTHENTICATED'|'INVALID_CREDENTIALS'|'FORBIDDEN'|'NOT_FOUND'|'USERNAME_TAKEN'|'EMAIL_TAKEN'|'INTERNAL';
export class ApiError extends Error {
  constructor(public status: number, public code: Code, message: string, public fields?: Record<string,string>)  // EXACT
  static validation(fields: Record<string,string>, message='Invalid input'): ApiError  // 400
  static unauthenticated(): ApiError  // 401 UNAUTHENTICATED
  static forbidden(): ApiError        // 403
  static notFound(): ApiError         // 404
}
export const notFound: RequestHandler        // unmatched -> 404 {error:{code:'NOT_FOUND',message}}
export const errorHandler: ErrorRequestHandler
```
errorHandler always returns `{error:{code,message,fields?}}`, omitting `fields` when it's undefined:
- An ApiError: its own status, code and message.
- `err.type==='entity.parse.failed'`: 400 VALIDATION.
- `err.type==='entity.too.large'`: 400 VALIDATION, "Request body too large".
- Anything else: 500 INTERNAL, "Internal server error". Call console.error, and put no stack or message in the body.
- If `res.headersSent` is already true, call next(err).

## WP2: api/markdown.ts
```ts
export function renderMarkdown(md: string): string
export function slugify(title: string): string
export function excerpt(markdown: string): string
```
**renderMarkdown:** `marked.parse(md, {async:false})`, then sanitize-html with:
- allowedTags: h1–h6, p, a, em, strong, code, pre, ul, ol, li, blockquote, hr, img, br, table, thead, tbody, tr, th, td
- allowedAttributes: a:[href, rel], img:[src, alt]
- allowedSchemesByTag: a → http, https, mailto; img → http, https
- allowProtocolRelative: false
- transformTags that sets rel="noopener nofollow" on every a
- script, style and iframe content discarded entirely
- no on* attributes, no javascript: or data: URLs
- raw HTML inside the Markdown is sanitized as well

**slugify:**
1. lowercase
2. NFKD, then strip `\p{M}`
3. replace runs of non-`[a-z0-9]` characters with `-`
4. trim `-` from both ends
5. slice(0,60)
6. trim a trailing `-` again
7. if the result is empty, return 'post'

**excerpt:** renderMarkdown, then sanitize-html with allowedTags [], then decode entities, collapse whitespace, trim, and take the first 200 chars. The result has no `<` and no `&amp;` text.

## Tests (node:test)
- db.test.ts:
  - tables and indexes exist
  - journal_mode is wal on a temp file
  - foreign_keys is 1
  - user_version is 1
  - reopening is idempotent and data survives
  - nested parent dirs are auto-created
  - the posts status CHECK rejects a bad status
  - deleting a user cascades to its posts and sessions
- errors.test.ts (tiny express app + supertest):
  - the ApiError helpers
  - an ApiError produces the JSON body
  - malformed JSON returns 400
  - a body over 100kb returns 400
  - a thrown Error returns 500 INTERNAL with no leak
  - notFound returns a 404 JSON body
- markdown.test.ts:
  - slugify: "", "!!!", "Café Ünïcode", a 100-char title, truncation at a hyphen, "Hello, World!"
  - sanitization: script, onerror, javascript:, data:, iframe, style, and raw-HTML variants
  - safe Markdown still renders: headings, lists, code, tables, links with rel
  - excerpt: 200-char cap, no tags, no entities, collapsed whitespace

## Done when
- `npx tsc --noEmit -p tsconfig.app.json` is clean for your files. If tsconfig.app.json doesn't include api/ yet, use `npx tsc --noEmit --strict --noPropertyAccessFromIndexSignature --esModuleInterop --skipLibCheck --module es2022 --moduleResolution bundler --target es2022 api/db.ts api/errors.ts api/markdown.ts` and report what you ran.
- `node --import tsx --test api/db.test.ts api/errors.test.ts api/markdown.test.ts` is green.

**Return:** files, exported signatures, test output with counts, your choices (oversize returns 400; how excerpt is built), and any deviations from this brief.
