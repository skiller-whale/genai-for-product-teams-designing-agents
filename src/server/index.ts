import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import routes from './routes';

const isProduction = process.env.NODE_ENV === 'production';
// In dev the Vite server (:8000) proxies /api to this backend on :8001. In
// production (the hosted environment) this server serves the built frontend
// AND the API on a single port, so no proxy is needed.
const port = Number(process.env.PORT ?? (isProduction ? 3000 : 8001));

const app = new Hono();

if (!isProduction) {
  app.use(
    '*',
    cors({
      origin: ['http://localhost:8000', 'http://127.0.0.1:8000'],
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    }),
  );
}

app.route('/api', routes);

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: err.message }, 500);
});

if (isProduction) {
  // Serve the Vite build output. The SPA fallback sends index.html for any
  // non-API, non-asset route so client-side rendering works on refresh.
  const root = './dist/client';
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ path: `${root}/index.html` }));
}

console.log(`Server running on http://localhost:${port} (production=${isProduction})`);

export default { port, fetch: app.fetch };
