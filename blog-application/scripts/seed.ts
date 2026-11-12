import { openDb } from '../api/db';
import { hashPassword } from '../api/auth/password';
import { renderMarkdown, slugify } from '../api/markdown';

type SeedPost = {
  title: string;
  body: string;
  status: 'draft' | 'published';
};

const BASE_TIME = Date.parse('2026-11-01T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const POSTS: SeedPost[] = [
  {
    title: 'Welcome to WeBlog',
    status: 'published',
    body: [
      'Welcome to WeBlog, a small place to publish your writing.',
      '',
      'Anyone can sign up, write posts in Markdown, and share them with readers. Posts are listed on the home page in the order they were published.',
    ].join('\n'),
  },
  {
    title: 'Writing in Markdown',
    status: 'published',
    body: [
      'Posts are written in Markdown. Here is a quick tour of what you can use.',
      '',
      '## Lists',
      '',
      '- Bullet points for loose ideas',
      '- Numbered steps for procedures',
      '',
      '## Code',
      '',
      '```ts',
      "const greeting = 'hello, weblog';",
      'console.log(greeting);',
      '```',
      '',
      'You can also add a [link to the Markdown guide](https://www.markdownguide.org/basic-syntax/).',
    ].join('\n'),
  },
  {
    title: 'Why I write',
    status: 'published',
    body: [
      'Writing forces me to finish a thought. Even a short post makes me check whether I understand something well enough to explain it.',
      '',
      'This blog is where I keep those notes, and where I invite others to read them.',
    ].join('\n'),
  },
  {
    title: 'Unfinished thoughts',
    status: 'draft',
    body: 'This draft is not published yet, so it should not appear in the public feed.',
  },
];

async function main(): Promise<void> {
  const dbPath = process.env['DATABASE_PATH'] ?? 'data/weblog.db';
  const db = openDb(dbPath);

  try {
    const now = new Date().toISOString();

    // User: reuse the existing demo account if present.
    let user = db.prepare('SELECT id FROM users WHERE username = ?').get('demo') as { id: number } | undefined;
    if (!user) {
      const passwordHash = await hashPassword('demo-password');
      const info = db
        .prepare(
          'INSERT INTO users (username, email, display_name, bio, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          'demo',
          'demo@example.com',
          'Demo Writer',
          'A demo account with a few sample posts.',
          passwordHash,
          now,
        );
      user = { id: Number(info.lastInsertRowid) };
    }
    const authorId = user.id;

    const findPost = db.prepare('SELECT id FROM posts WHERE author_id = ? AND title = ?');
    const slugTaken = db.prepare('SELECT 1 FROM posts WHERE slug = ?');
    const insertPost = db.prepare(
      `INSERT INTO posts (author_id, slug, title, body, body_html, status, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    let created = 0;
    let skipped = 0;
    let publishedIndex = 0;

    for (const post of POSTS) {
      if (findPost.get(authorId, post.title)) {
        skipped++;
        continue;
      }

      const base = slugify(post.title);
      let slug = base;
      for (let n = 2; slugTaken.get(slug); n++) {
        slug = `${base}-${n}`;
      }

      const createdAt = new Date(BASE_TIME + publishedIndex * DAY_MS).toISOString();
      const publishedAt = post.status === 'published' ? createdAt : null;
      if (post.status === 'published') publishedIndex++;

      insertPost.run(
        authorId,
        slug,
        post.title,
        post.body,
        renderMarkdown(post.body),
        post.status,
        createdAt,
        createdAt,
        publishedAt,
      );
      created++;
    }

    console.log(`Seeded: user demo, ${created} posts created, ${skipped} skipped`);
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
