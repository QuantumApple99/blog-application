import type { Database } from 'better-sqlite3';
import { listPublished, type Page, type PostSummary } from './repo';

export type { Page, Post, PostSummary } from './repo';
export { parsePage } from './page';
export { postsRouter } from './routes';

export function listPublishedPostsByAuthor(db: Database, authorId: number, page: number): Page<PostSummary> {
  return listPublished(db, { authorId, page });
}
