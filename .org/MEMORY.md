# Org memory: WeBlog (blog-application)
_Last updated: 2026-11-12 (sprint 2026-11-12-usable-product, closed)_

## Project overview
- WeBlog: a multi-user blogging platform (anyone signs up and publishes; anyone reads).
- Repo root: `/Users/quantumapple/Desktop/Culture/sample/blog-application`. **The app lives in the nested `blog-application/` subfolder** (package.json, angular.json, server.ts, src/). Run npm commands from there.
- Angular 18 standalone components + SSR (`@angular/ssr`, Express in `server.ts`). Components live in `src/<name>/` (not under `src/app/`); services in `src/*.service.ts`.
- GitHub: QuantumApple99/blog-application. Work on branch `sprint/usable-product`.

## How to run things
- Node 24 / npm 11 locally. Chrome installed at `/Applications/Google Chrome.app` (for Karma ChromeHeadless).
- Install: `cd blog-application && npm ci` · Dev: `npm start` (ng serve) · Build: `npm run build` · Tests: `npm test` (to be unified this sprint).
- SSR server after build: `node dist/scratch-angular-app/server/server.mjs` (dist folder name follows the package name; may change this sprint).
- npm 11 warns about blocked install-scripts; better-sqlite3 still loads locally (verified). Docker builds must make sure native modules get built.
- `tsconfig.app.json` does NOT include `api/`; typecheck api with a targeted strict tsc (see sprint decisions). API tests: `node --import tsx --test "api/**/*.test.ts"`.
- npm allowScripts pins exact versions (better-sqlite3, esbuild); bumping them requires `npm install-scripts approve` again.
- Docker is NOT installed on this machine: Docker files can't be built/verified locally.

## Architecture (from sprint 2026-11-12)
- Backend: `blog-application/api/` (no Angular imports); `createApi({db})` mounted at `/api` in `server.ts` before static/Angular handlers. API contract: sprints/2026-11-12-usable-product/contracts.md.
- Config env: `DATABASE_PATH` (default `./data/weblog.db`; Docker `/data/weblog.db`), `PORT` (4000), `COOKIE_SECURE`, `BCRYPT_ROUNDS`, `NODE_ENV`.
- Session cookie `sid` (HttpOnly, SameSite=Lax, 30d), sessions in SQLite. API returns raw `body` + server-sanitized `html`; client never bypasses Angular sanitizer.
- SSR calls the API over loopback HTTP using `SSR_REQUEST` token (`src/ssr-request.token.ts`) to forward cookies.
- Frontend: `src/core` (only `api.service.ts` uses HttpClient; AuthService, guards, SSR interceptor, TitleStrategy), `src/shared`, `src/pages/<page>`, `src/header`. Titles: `<Page> · WeBlog`.

## Operations tips
- Stop a local server by PID: `lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill` (broad `pkill -f` is blocked by the permission classifier).
- Seed: `npm run seed` (demo / demo-password); Docker: `docker compose --profile tools run --rm seed`.
- Build output `dist/weblog/`; `npm start` serves SSR + API on PORT (default 4000).

- 375px checks headlessly: use Chrome CDP `Emulation.setDeviceMetricsOverride` (plain `--window-size` clips).

## Conventions
- Standalone components, `inject()` for DI, new control flow (`@if`, `@for`).
- Keep the existing component folder layout unless the contract says otherwise.

## Standing decisions
- Sanitizer allowlist: img src absolute http(s) only (else img dropped); a href http/https/mailto only (else href stripped, incl. #fragments).
- SSR responses: `Cache-Control: private, no-store` + `Vary: Cookie`; expired sessions purged at startup + hourly.
- Inline text links may be <40px; controls (buttons/inputs/nav) must be ≥40px.
- Multi-user platform; public reading, auth required to write. (sprint 2026-11-12)
- Backend = `/api/*` router inside the existing Express server (`server.ts`); SQLite via `better-sqlite3`; bcrypt passwords; server-side sessions in SQLite with HttpOnly SameSite cookie. No JWT, no separate service. (sprint 2026-11-12)
- Local + Docker-ready; no deployment without stakeholder approval. Never push to GitHub without stakeholder approval.
- `.org/` is committed to the repo.

## Glossary
- **Post / blog:** an article with title + Markdown body; status `draft` or `published`.
- **Feed:** public list of published posts, newest first.
- **Stakeholder:** the user (repo owner). **CEO:** main Claude session.

## Lessons learned
- SSR: never derive the API origin from the client Host header; route every `/api/` call to the internal origin in a server-only HttpBackend (after the transfer cache). Test SSR with a FOREIGN Host header + explicit `Cookie:` (curl -b won't send a localhost cookie to another Host).
- Angular user interceptors run BEFORE the transfer-cache interceptor; rewriting URLs there breaks cache keys → rewrite in the backend instead. Verify with CDP that the browser makes no data refetch after hydration.
- "Logged-in header in SSR" checks must look for header-only strings (Logout / My posts), not names that also appear publicly (bylines).
- A fresh-eyes reviewer outside the org found the two most important SSR defects that 5 levels of testing missed; keep that step.
- Parallel teams: CEO installs shared deps centrally and creates shared tokens/files up front to avoid package.json/file collisions.

## Sprint index
| Date | Sprint | Outcome | Folder |
|---|---|---|---|
| 2026-11-12 | Make it a usable product (Large, Mode A) | ✅ shipped to branch sprint/usable-product (not pushed); 12/12 criteria, Docker unverified | sprints/2026-11-12-usable-product |

## Backlog (from sprint 2026-11-12 review, deferred)
- Require JSON content-type or a custom header on ALL mutating requests incl. bodyless (logout CSRF from sibling subdomains).
- Return 404 (not 403) for edit/delete of someone else's draft; consider per-user slug namespace to avoid draft existence leak.
- Login/signup rate limiting.
- Real HTTP 404 status for SSR not-found pages.
- Verify Docker build/compose on a machine with Docker.
- v2 features: comments, likes, tags/search, image uploads, password reset, following.
