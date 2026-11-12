# Brief: qa-posts-ui (independent tester, from mgr-posts-ui)

You're an independent tester. You see only this specification and the published interfaces.

## What you may read
- **Before Phase 1 is finished:** do NOT read the implementation under `SRC/pages/{feed,post,author,my-posts,editor}/**`, `SRC/shared/post-card/**` or `SRC/shared/pagination/**`.
- **During Phase 2:** read implementation only to diagnose a failure you already have.
- **Never** edit non-test code. Don't copy the engineers' `*.spec.ts`. Don't read other files in `briefs/`.

## Setup
- **App:** `/Users/quantumapple/Desktop/Culture/sample/blog-application/blog-application`. Sources are in `src/`.
- **Test command:** `npx ng test --watch=false --browsers=ChromeHeadless`. Report it if it needs `--no-sandbox`.
- Don't touch `.org/`.
- **Mocks:** use `Pick<ApiService,...>` with jasmine spies.
  - `ApiService`, `AuthService`, `ApiError` and the models live in `src/core/`.
  - `LoadStateComponent` is in `src/shared/load-state/`.
  - Check signatures only there, with `grep -n export`.
- **Routing:** use `provideRouter([])` and set inputs with `ComponentRef.setInput('slug'|'username'|'page', ...)`.
- Assert through the DOM: text, roles, `href`s, `disabled`, element presence.
- Never use `bypassSecurityTrust*`.

## Files you create (only these)
- `src/pages/feed/feed.page.qa.spec.ts`
- `src/pages/post/post.page.qa.spec.ts`
- `src/pages/author/author.page.qa.spec.ts`
- `src/pages/my-posts/my-posts.page.qa.spec.ts`
- `src/pages/editor/editor.page.qa.spec.ts`
- `src/shared/post-card/post-card.component.qa.spec.ts`
- `src/shared/pagination/pagination.component.qa.spec.ts`

## Components under test
- Pages: `FeedPage`, `PostPage`, `AuthorPage`, `MyPostsPage`, `EditorPage`, each in `src/pages/<x>/<x>.page.ts`.
- `PostCardComponent`: selector `app-post-card`, input `post`.
- `PaginationComponent`: selector `app-pagination`, inputs `page` and `totalPages`.
- `NotFoundViewComponent`: selector `app-not-found-view`, in `src/pages/not-found/not-found.page.ts`.

## Phases
**Phase 1 (now).** Write the specs from the criteria below. They may not compile or pass until the pages exist, and that's expected. Return the file list, the number of specs per criterion ID, and anything you couldn't express.

**Phase 2 (when told).**
1. Run the suite and triage each failure into one of:
   - (a) an implementation bug
   - (b) a defect in your spec
   - (c) an ambiguous criterion
2. Fix only (b).
3. Report (a) and (c) with the criterion ID and DOM evidence.

## Data shapes
- `PostSummary = {id, slug, title, excerpt, status, author:{username, displayName}, createdAt, updatedAt, publishedAt|null}`
- `Post = PostSummary + {body, html}`
- `Page<T> = {items, page, pageSize:10, total, totalPages}`
- Errors are `new ApiError(status, code, message, fields?)`.

## Feed
- **F1.** While loading, there is a `role=status` element and no cards.
- **F2.** With 2 items, there are 2 cards. Each has:
  - the title as a link to `/posts/<slug>`
  - the excerpt
  - the author as a link to `/u/<username>`
  - a date
- **F3.** When empty, the page says "No posts yet".
  - Logged in: a "Write one" link to `/me/posts/new`.
  - Logged out: a "Sign up" link to `/signup`.
- **F4.** On error, there is a `role=alert` element and a Retry button. Retry calls `listPosts` again. If that succeeds, the cards appear.
- **F5.** Input `page='2'` calls `listPosts(2)`. A missing value, `'abc'` or `'0'` calls `listPosts(1)`.
- **F6.** Pagination links:
  - On page 2 of 3: Previous has `page=1` and Next has `page=3`.
  - On page 1: no Previous.
  - On the last page: no Next.
  - With `totalPages<=1`: no pagination nav at all.
- **F7.** Requesting page 5 when `totalPages` is 2 and items are empty shows the empty state with a link to page 1 (`/` or `/?page=1`), and no cards.
- **F8.** After loading, the document title is exactly `"WeBlog"`.

## Post
- **P1.** `getPost` is called with the slug. The page shows the title, the author (a link to `/u/<username>`) and the date.
- **P2.** HTML is rendered as DOM: a `<strong>` exists inside the body. The raw `body` text is not shown.
- **P3.** Sanitization. Given `html='<p>ok</p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=1">'`:
  - no `<script>` element exists
  - `window.__pwned` is undefined
  - no `onerror` attribute exists
- **P4.** A draft shows a Draft badge. A published post shows no badge.
- **P5.** Edit and Delete controls appear only when `isOwner` is true. Logged out, or as another user, neither exists. As the owner:
  - Edit is a link to `/me/posts/<slug>/edit`
  - Delete is a button
- **P6.** Owner Delete:
  - If `confirm` returns false, `deletePost` is not called.
  - If it returns true, `deletePost('<slug>')` is called and then the page navigates to `/me/posts`.
- **P7.** Error handling:
  - A 404 shows the not-found view in place (the text contains "not found", case-insensitive), with no Retry. The title is `'Not found · WeBlog'`.
  - A 500 shows `role=alert` with Retry.
- **P8.** After loading, the title is `'<post title> · WeBlog'`.

## Author
- **A1.** `getUser(username)` and `getUserPosts(username, 1)` are called. The page shows the displayName, the bio and the published cards, plus pagination when `totalPages>1`. The title is `'<displayName> · WeBlog'`.
- **A2.** A 404 from either call shows the not-found view.
- **A3.** When the user isn't the owner, or is logged out, there is no "Edit profile" button and no form.
- **A4.** On your own profile:
  1. "Edit profile" opens the form with inputs prefilled.
  2. Submitting calls `updateMe({displayName, bio})` with exactly the entered values.
  3. Then `setUser` is called with the returned user, and the displayed name updates.
- **A5.** With an empty displayName, submitting makes no `updateMe` call. Submit is disabled while the request is pending (use a Subject).
- **A6.** A 400 response with `fields {displayName:'Too long'}` shows "Too long" near the displayName input, and the form stays open.
- **A7.** An empty list shows a "No published posts yet"-style message, not an error.

## My posts
- **M1.** `listMyPosts(1)` is called by default. Each row shows the title, a Draft or Published badge, and an updated date.
- **M2.** Each row has an Edit link to `/me/posts/<slug>/edit`. A View link to `/posts/<slug>` appears only for published posts.
- **M3.** Delete:
  - If `confirm` returns false: no API call, and the row stays.
  - If it returns true: `deletePost('<slug>')` is called once and the row disappears.
- **M4.** Deleting the last row:
  - On page 2: navigates to page 1, or reloads.
  - On page 1: shows the empty state.
- **M5.** When empty, the page shows "No posts yet" and a "Write one" link to `/me/posts/new`.
- **M6.** On error: `role=alert` with Retry. Pagination appears when `totalPages>1`.
- **M7.** If `deletePost` errors, the row stays and an alert is shown.

## Editor
- **E1.** Create mode (no slug):
  - The form has title, body and status controls. Status defaults to draft.
  - Saving calls `createPost({title, body, status})`.
  - On success, a published post navigates to `/posts/<returned slug>`. A draft navigates to `/me/posts`.
  - `getPost` is not called.
- **E2.** Edit mode (`slug='my-post'`):
  - `getPost('my-post')` is called and the form is prefilled.
  - Saving calls `updatePost('my-post', {title, body, status})`, never with a different slug.
- **E3.** Edit mode shows the not-found view, with no form, when `getPost` returns 404, or when `isOwner` is false.
- **E4.** Validation:
  - An empty title: submit is blocked and no call is made.
  - A title over 200 characters is invalid.
  - A body over 100000 characters is invalid.
- **E5.** A 400 response with `fields {title:'Title is required'}` shows that message under the title. The page stays and submit is re-enabled.
- **E6.** Submit is disabled while the save is pending (use a Subject) and re-enabled after an error.
- **E7.** Other errors:
  - A 401 navigates to a URL starting with `/login?returnUrl=`.
  - A 500 shows a `role=alert` banner and keeps the form.
- **E8.** Delete:
  - Edit mode has a Delete button. Create mode doesn't.
  - If `confirm` returns false: no call.
  - If true: `deletePost('my-post')`, then navigation to `/me/posts`.
- **E9.** The body is a plain `<textarea>`. Nothing renders Markdown or HTML as a preview.

## Shared components
- **C1. post-card:**
  - The title links to `/posts/<slug>`.
  - The author links to `/u/<username>` and shows the displayName.
  - The excerpt and a date are shown.
  - A Draft badge appears only for drafts.
- **C2. pagination:**
  - Page 1 of 1: renders nothing.
  - Page 2 of 3: Previous (`page=1`), Next (`page=3`) and "Page 2 of 3"-style text.
  - Page 1 of 3: no Previous.
  - Page 3 of 3: no Next.

## Layout proxies (375px host div)
- No page root has `scrollWidth > clientWidth+1`.
- Every control in the editor, the my-posts rows and the author form has `offsetHeight >= 40`.
- If `styles.css` isn't loaded in Karma, mark these tests pending and say so.

## Report (Phase 2)
1. Files written, and specs per criterion ID.
2. Phase 1 status.
3. Totals (total/passed/failed) from `ng test`, and the result of `ng build`.
4. For each failure:
   - criterion ID
   - expected vs actual
   - DOM evidence
   - classification
   - suggested owner: eng-reader, eng-editor or mgr-app-shell
5. Criteria that can't be tested at unit level, with the reason.
