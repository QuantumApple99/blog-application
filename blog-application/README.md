# WeBlog

## What it is

WeBlog is a multi-user blogging platform. The front end is Angular 18 with server-side rendering, the API is Express, and data is stored in SQLite (via `better-sqlite3`).

## Requirements

- Node.js 20 or newer. The project is built and tested on Node 24.
- Google Chrome (or Chromium) for the web unit tests.

## Quick start

```bash
npm ci
npm run build
npm start          # http://localhost:4000
```

Optionally load demo data in a second terminal:

```bash
npm run seed
```

Then sign in with the demo account: username `demo`, password `demo-password`.

## Development

```bash
npm run dev        # UI on http://localhost:4200
```

`npm run dev` serves the Angular UI on port 4200 and proxies `/api` to port 4000 (see `proxy.conf.json`). Because of that, run the API in a second terminal after a build:

```bash
npm run build
npm start          # API on port 4000
```

Limitation: server-side rendering under `ng serve` does not reach the API. Pages rendered on the server only get data when running the built server (`npm start`). Use `npm run dev` for client-side work and `npm start` to check SSR.

## Configuration

Settings are read from environment variables (a `.env.example` file lists them).

| Variable       | Default            | Purpose                                                                                                   |
| -------------- | ------------------ | --------------------------------------------------------------------------------------------------------- |
| `PORT`         | `4000`             | HTTP port the server listens on                                                                           |
| `DATABASE_PATH`| `./data/weblog.db` | SQLite database file                                                                                      |
| `NODE_ENV`     | (unset)            | Set to `production` for production behaviour                                                              |
| `COOKIE_SECURE`| `false`            | Set `true` when served over HTTPS. The `Secure` cookie flag is only applied when `NODE_ENV=production` and this is not `false` |
| `BCRYPT_ROUNDS`| `12`               | Password hashing cost factor                                                                              |

## Tests

```bash
npm test              # API tests, then web tests
npm run test:api      # API tests only (node:test + supertest)
npm run test:web      # Angular specs in headless Chrome (Karma)
```

The web tests need Chrome. If it is not found automatically, set `CHROME_BIN` to the browser path, for example:

```bash
CHROME_BIN="/path/to/chrome" npm run test:web
```

## Docker

```bash
docker compose up --build                          # app on http://localhost:4000
docker compose --profile tools run --rm seed       # optional demo data
```

- The database lives in the named volume `weblog-data`, mounted at `/data` in the container (`DATABASE_PATH=/data/weblog.db`).
- Health check: `GET /api/health`.
- Seeding works before or after the first `app` start, because the seed service runs as the `node` user and the volume is owned by `node`.
- Port and cookie/hashing settings can be overridden with `PORT`, `COOKIE_SECURE` and `BCRYPT_ROUNDS` in your shell or a `.env` file next to `docker-compose.yml`.

The Docker setup remains unverified: it has not been run with a real build, because Docker was not available when it was written.

## Deploying

- Run as a single container with the persistent `/data` volume.
- SQLite supports a single writer, so run one instance only.
- Put the app behind HTTPS (a reverse proxy or load balancer) and set `COOKIE_SECURE=true`.
- Back up the `weblog-data` volume (or the file at `DATABASE_PATH`) regularly.

## Project layout

- `api/`: Express API routes, data access and API tests
- `src/`: Angular application (UI, SSR entry points)
- `scripts/`: tooling such as the demo data seed
- `server.ts`: SSR and API server entry point
- `public/`: static assets
- `proxy.conf.json`: dev-server proxy for `/api`

## Install scripts

npm 11 blocks dependency lifecycle scripts unless they are approved. The approvals for `better-sqlite3` and `esbuild` are recorded in `package.json` (`allowScripts`) and are committed. If `better-sqlite3` fails to load (for example after switching Node versions), run:

```bash
npm rebuild better-sqlite3
```

To review pending approvals, run `npm install-scripts ls`.
