export interface PublicUser {
  username: string;
  displayName: string;
  bio: string;
  createdAt: string;
}

export interface Me extends PublicUser {
  id: number;
  email: string;
}

export interface PostSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  status: 'draft' | 'published';
  author: { username: string; displayName: string };
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface Post extends PostSummary {
  body: string;
  html: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PostInput {
  title: string;
  body: string;
  status: 'draft' | 'published';
}

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}
