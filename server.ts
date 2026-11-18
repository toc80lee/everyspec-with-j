import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { getConfiguredGeminiApiKey } from './server/geminiClient.ts';
import { aiSpecRoutes } from './server/routes/aiSpecRoutes.ts';
import { meetingRoutes } from './server/routes/meetingRoutes.ts';

dotenv.config();

const app = express();
const PORT =
  process.env.NODE_ENV !== 'production' ||
  (process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT)
    ? Number(process.env.DEFAULT_APP_PORT) || 3000
    : Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(getConfiguredGeminiApiKey()),
    env: process.env.NODE_ENV || 'development',
  });
});

app.use(aiSpecRoutes);
app.use(meetingRoutes);

app.all('/api/*', (_req, res) => {
  res.status(404).json({
    code: 'API_NOT_FOUND',
    error: '요청한 API 엔드포인트를 찾을 수 없습니다.',
  });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
