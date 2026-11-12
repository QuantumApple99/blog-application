# Status
| Task | Owner | Tester | Rework # | Tester | Manager | MD | VP | CEO |
|---|---|---|---|---|---|---|---|---|
| Identity slice (api/auth, api/users) | eng-auth-api | qa-auth | 1 | ✅ 103/103 | ✅ integration 1-8 | ✅ | ✅ | | | |
| Data layer (db, errors, markdown) | eng-data-layer | qa-posts-api | 1 | ✅ (via AC suite 53/53) | ✅ Gates 0-3 | ✅ (rework: relative img src/href) | ✅ | | |
| Posts API + createApi | eng-posts-api | qa-posts-api | 0 | ✅ 53/53 AC-01..18 | ✅ Gates 0-3 | ✅ | ✅ | | | | |
| App shell (core, routes, auth pages) | eng-routing-shell | qa-app-shell | 1 | ✅ 92/92 (isolated run) | ✅ (rework: index.html title) | ✅ | ✅ | | |
| Reader pages | eng-reader | qa-posts-ui | 0 | ✅ feed16 post13 author13 cards/pagination | ✅ | ✅ | ✅ | |
| Editor pages | eng-editor | qa-posts-ui | 0 | ✅ my-posts11 editor20 | ✅ | ✅ | ✅ | |
| Delivery phase 1 (scripts, angular.json, Docker, README) | eng-delivery | (mgr-delivery verifies) | 1 | — | ✅ A1-A3,A7-A9 (nit fixed) | — | ✅ | |
| Delivery phase 2 (server.ts, seed, e2e) | eng-delivery | (mgr-delivery verifies) | 0 | — | ✅ A3-A6,A8 | — | ✅ | |

## Evidence

### Delivery phase 1 / manager
- mgr-delivery: A1 angular.json ok; A2 scripts exact; A3 fresh-copy `npm run build` ok (4.1s); A7 Dockerfile/compose match (unbuilt: no Docker); A8 README ok; A9 scope ok.
### Data layer / engineer
- `node --import tsx --test api/db.test.ts api/errors.test.ts api/markdown.test.ts` → 17/17; full `api/**/*.test.ts` → 120/120 (incl. qa-auth suites).

### Identity slice / tester
- qa-auth Phase 2: `node --import tsx --test "api/auth/**/*.test.ts" "api/users/**/*.test.ts"` → 103 pass / 0 fail / 0 skip; harness deleted; all criteria PASS. /users/:u/posts ran against temporary fallback, re-run after seam switch.

### App shell / engineer
- `npx ng build` clean; `ng test` 72 pass / 23 fail, all 23 in QA specs (22 = spec route config maps /login to Dummy; 1 = LoadState input names, since fixed). Transfer-cache `filter` exists in Angular 18.2.2; APP_INITIALIZER used. Known nit: src/index.html <title>ScratchAngularApp</title>.

### Posts API / engineer
- `node --import tsx --test "api/**/*.test.ts"` → 192/192 (repo 13, routes 6, posts.qa 51). Deviations: added posts/page.ts (avoid cycle); routes imports requireAuth from ../auth/middleware (avoid cycle). parsePage strict /^\d+$/; totalPages=0 when empty.

### Posts API / tester
- qa-posts-api: `node --import tsx --test api/posts/posts.qa.test.ts api/persistence.qa.test.ts` → 53/53; all AC PASS; no 413; sid survives reopen.

### Posts API / manager
- mgr-posts-api: Gate1 192/192; Gate2 ordering/concurrency(20 distinct slugs)/adversarial pages/XSS/feed≡user-posts; Gate3 seam live. No rework.

### App shell / tester
- qa-app-shell: 92/92 across 11 qa specs (isolated tsconfig; full suite blocked at that time by posts-ui modules not existing). 2 spec defects fixed by QA (route stubs, withComponentInputBinding). No impl bugs.

### Posts API / MD
- md-api re-ran: 192/192; schema/pragmas/indexes; contract shapes; 401/404/403; drafts; slugs; pagination(26 posts); sanitization payloads; no-store; persistence reopen. Rework: relative <img src> survives (contract: http/https) → eng-data-layer attempt 1.

### Identity / rework 1
- eng-auth-api switched posts-source.ts to re-export from ../posts; api suite 192/192.
### Reader pages / engineer
- eng-reader: ng build green; ng test 179 pass / 11 fail (all in MyPostsPage, eng-editor in progress). No signature diffs.

### Data layer / rework 1
- eng-data-layer: relative/protocol-relative/non-http img dropped; non-allowlisted hrefs stripped; `api/**/*.test.ts` 193/193. Closed.

### Identity / manager
- mgr-auth: PASS 1-8 (live createApi probe; cookie flags; static greps). Rework: qa-auth drop '.ts' import exts (TS5097).

### Editor pages / engineer
- eng-editor: ng build green; ng test 191 → 182 pass / 9 fail (all MyPostsPage QA; suspected selector mismatch, rows are div.card.stack). Own specs pass.

### Identity / QA rework 1
- qa-auth removed '.ts' import extensions; 103/103; strict tsc over qa tests: 0 errors. Closed.

### Identity / MD
- md-identity: 193/193; mutation test (unknown-user msg) → 2 fails then restored; live kill+restart keeps session; identical 401 bodies; deviations 1-5 accepted.

### Delivery phase 2 / engineer
- build exit 0; seed idempotent (4/0 then 0/4); :4100 health ok, feed 3 items draft absent, SSR '/' has titles, /login title ok, cookie login + me ok, SIGTERM exit; `npm test` exit 0 (api 193, web 191); fresh-copy npm ci+build ok.

### Posts UI / tester
- qa-posts-ui Phase 2: full `ng test` 191/191; 1 spec defect (row selector) fixed by QA; no impl bugs. NG0205 log noise in full run (not failing).

### Delivery / manager phase 2
- mgr-delivery: fresh npm ci+build; seed idempotent; SSR '/' + /posts/why-i-write titles; cookie login; SSR cookie forwarding (Demo Writer in HTML); real restart keeps session+posts; npm test exit 0 and non-zero when api or web broken; README commands run.

### Posts UI / manager
- mgr-posts-ui 1-6 PASS: build+191/191; static rules; route wiring; real-API SSR titles, sanitization (post-body stripped), drafts, guard under SSR, pagination ?page=2/99, slug stable; CDP 375px on 7 pages: scrollWidth==375, controls ≥40px. Note: not-found pages return HTTP 200 (contract nice-to-have).

### App shell / manager
- mgr-app-shell: build ok; 191/191; deletion + rule audits; 9 lazy routes; transfer-cache filter; real-server SSR (login/nope/feed, logged-in header first paint, guards on server). #8 375px covered by mgr-posts-ui CDP run. NG0205 traced to editor specs (QA hygiene rework).

### Backend workstream / VP
- vp-platform 1-7 PASS on :4203: seed idempotent; full curl flow (409/400/401 identical, drafts 404/200, 403/401, slug -2, pagination 11); sanitization; real restart keeps session+draft; npm test exit 0 (193+191); SSR draft with/without cookie; architecture sound. Docker unverified.

### Frontend hygiene
- index.html title → WeBlog (eng-routing-shell). editor.page.spec.ts stubs navigateByUrl → NG0205 = 0 (eng-editor). Full ng test 191/191.

### Frontend / MD
- md-web 7/7 PASS on :4204 (suite, build, rules, routes, real-server SSR incl. drafts/guards/transfer-state, CDP 375px, contract fields). Inline text links <40px accepted by CEO.

### Frontend workstream / VP
- vp-product 10/10 PASS on :4205 (build+191; SSR content; sanitization; guards; full signup→draft→publish→delete; pagination 16 posts; profile; titles/404; CDP 375px; architecture sound).

## CEO production check (2026-11-12)
- `npm run build` → OK (dist/weblog; only CommonJS warnings for cookie-parser, sanitize-html).
- `npm test` → exit 0; api 193/193 (0 skipped); web TOTAL 191 SUCCESS; NG0205 count 0.
- Real server :4300, fresh DB, criteria walk:
  - C1: seed 4/0 then 0/4; /api/health {"ok":true}; "/" SSR <title>WeBlog</title>.
  - C2: signup 201; dup username 409; dup email 409 EMAIL_TAKEN; bad username+short password → 400 with both fields; hash `$2b$`; /auth/me has no password_hash.
  - C3: Set-Cookie sid=<64hex>; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax; wrong password vs unknown user → identical INVALID_CREDENTIALS body.
  - C4: anon create 401; other user PATCH/DELETE 403.
  - C5: draft 404 anon, 404 other user, 200 author; absent from feed; publish → first in feed; pageSize 10; 13 posts → page 2 has 3, totalPages 2.
  - C6: <script>, onerror stripped (html `<p>secret  <strong>bold</strong> </p>`); /posts/<slug> SSR title "Alice Renamed · WeBlog"; slug stable after rename; 0 `<script>alert` in SSR.
  - C7: PATCH /users/me 200 → /u/alice title "Alice A · WeBlog"; /api/users/alice has no email.
  - C8: /me/posts anon → Log in view; with cookie → My posts.
  - C9: /zzz, /posts/nope, /u/nobody → Not found · WeBlog; /login,/signup when logged in → My posts (guestGuard); /me/posts/new title ok. 375px: verified by md-web + vp-product via CDP (scrollWidth 375 on 6–7 pages).
  - C10: restart on same DB → old cookie still alice; 13 posts remain; SSR header shows user after restart.
  - C11: see npm test above.
  - C12: Dockerfile, docker-compose.yml, .env.example, README present; Docker build UNVERIFIED (no Docker installed).
- Fresh-eyes review: in progress.

## Production check rework round (CEO)
| Item | Owner | Status |
|---|---|---|
| M1 transfer-cache key mismatch | eng-routing-shell | ⏳ |
| L2/L4/L7 server.ts headers, session purge, Docker seed ownership | eng-delivery | ⏳ |
| L8 page clamp feed/author | eng-reader | ⏳ |
| L8 page clamp my-posts | eng-editor | ⏳ |
| M1 transfer-cache key mismatch | eng-routing-shell | ✅ (CDP: browser fetches only /api/auth/me after hydration) |
| L2/L4/L7 | eng-delivery | ✅ (headers present; expired session purged; YAML ok; Docker unverified) |
| L8 clamp | eng-reader, eng-editor | ✅ (web 195/195) |
| H1 SSR Host-header origin (SSRF + logged-out SSR on real domains) | eng-routing-shell | ⏳ |
| H1 SSR Host-header origin | eng-routing-shell (+qa-app-shell spec update) | ✅ reviewer: fixed, no remaining findings; CEO forged-Host check 0 dummy hits |

## FINAL (CEO): npm run build ✅; npm test exit 0 (api 193/193, web 199/199, NG0205 0); criteria 1–11 ✅ on real server, 12 ✅ files present / Docker build unverified. Committed on sprint/usable-product, not pushed.
