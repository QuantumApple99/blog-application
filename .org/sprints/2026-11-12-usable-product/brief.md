# Make blog-application a usable product
Date: 2026-11-12 · Tier: Large · Mode: A

## Request
"take the blog-application repo, and make it into a usable product"

## Kickoff decisions
- Q1 Audience → multi-user platform (anyone signs up & publishes, anyone reads).
- Q2 Stack → extend existing Express (server.ts) with /api; SQLite (better-sqlite3); bcrypt; server-side sessions in SQLite, HttpOnly SameSite cookie.
- Q3 v1 scope → accounts (signup/login/logout, display name, bio); create/edit/delete own posts; drafts vs published; sanitized Markdown; public paginated feed, /posts/:slug, /u/:username; /me/posts dashboard; loading/empty/error states, 404, mobile, page titles.
- Q4 Deployment → local + Docker-ready (Dockerfile, compose w/ DB volume, .env.example, README, seed script). No deploy.
- Q5 Git → branch sprint/usable-product; commit .org/; single commit after production check; NO push.

## Acceptance criteria
1. `npm ci && npm run build && npm start` serves the app with SSR on PORT (default 4000); `npm run seed` creates a demo user + sample posts.
2. Signup: username, email, display name, password ≥8; duplicate username/email → clear error; passwords bcrypt-hashed, never returned by API.
3. Login/logout via HttpOnly SameSite session cookie; sessions stored in SQLite (survive restart); wrong credentials → generic error.
4. Logged-in users create posts (title, Markdown body, draft/published), edit & delete **own** posts; API 401 when logged out, 403 on others' posts.
5. Drafts visible only to their author (API + UI); public feed shows published only, newest first, 10 per page.
6. `/posts/:slug` works by direct URL without login (SSR on refresh); unique slugs; Markdown rendered & sanitized (`<script>`, `onerror=` stripped).
7. `/u/:username` shows bio + published posts; users can edit their own display name and bio.
8. `/me/posts` lists own drafts + published with edit/delete; logged-out → redirect to login.
9. Loading, empty, error states; 404 page for unknown routes/posts; usable at 375px; per-route page titles; nav links work.
10. All data persists across server restart.
11. API tests (node:test + supertest) cover auth, ownership, drafts, sanitization; Angular unit tests pass in ChromeHeadless; one `npm test` runs all green (stale spec fixed).
12. Dockerfile, docker-compose.yml (DB volume), .env.example, README (setup/run/test/deploy). Docker build unverified locally (Docker not installed).

## Out of scope (v2)
Comments, likes, tags/search, image uploads, password reset/email, following, real deployment.
