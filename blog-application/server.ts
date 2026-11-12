import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine } from '@angular/ssr';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import bootstrap from './src/main.server';
import { createApi } from './api/index';
import { openDb } from './api/db';
import { purgeExpired } from './api/auth/sessions';
import { SSR_REQUEST } from './src/ssr-request.token';

const port = process.env['PORT'] || 4000;

// The Express app is exported so that it can be used by serverless Functions.
export function app(): express.Express {
  const server = express();
  const serverDistFolder = dirname(fileURLToPath(import.meta.url));
  const browserDistFolder = resolve(serverDistFolder, '../browser');
  const indexHtml = join(serverDistFolder, 'index.server.html');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', browserDistFolder);

  // REST API, mounted before static and SSR handlers.
  const db = openDb(process.env['DATABASE_PATH'] ?? 'data/weblog.db');
  server.use('/api', createApi({ db }));

  // Remove expired sessions at startup and then hourly.
  purgeExpired(db);
  setInterval(() => purgeExpired(db), 3600_000).unref();

  // Serve static files from /browser (index:false so "/" is rendered by SSR)
  server.get('**', express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
  }));

  // All regular routes use the Angular engine
  server.get('**', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;

    commonEngine
      .render({
        bootstrap,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: browserDistFolder,
        providers: [
          { provide: APP_BASE_HREF, useValue: baseUrl },
          { provide: SSR_REQUEST, useValue: { cookie: headers.cookie ?? '', origin: `http://127.0.0.1:${port}` } },
        ],
      })
      .then((html) => {
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Cookie');
        res.send(html);
      })
      .catch((err) => next(err));
  });

  return server;
}

function run(): void {
  // Start up the Node server
  const server = app();
  const httpServer = server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });

  const shutdown = () => httpServer.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

run();
