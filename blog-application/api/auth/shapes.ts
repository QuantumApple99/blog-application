import type { SessionUser } from './sessions';

export interface UserRow {
  id: number;
  username: string;
  email: string;
  display_name: string;
  bio: string;
  created_at: string;
}

export function toMe(r: UserRow) {
  return {
    id: r.id,
    username: r.username,
    email: r.email,
    displayName: r.display_name,
    bio: r.bio,
    createdAt: r.created_at,
  };
}

export function meFromSession(u: SessionUser) {
  return { id: u.id, username: u.username, email: u.email, displayName: u.displayName, bio: u.bio, createdAt: u.createdAt };
}

export function toPublicUser(r: UserRow) {
  return { username: r.username, displayName: r.display_name, bio: r.bio, createdAt: r.created_at };
}
