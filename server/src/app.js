import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { staffRouter } from './routes/staff.js';
import { errorHandler, HttpError } from './middleware.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // CSRF defence for cookie auth: state-changing requests must come from our own site.
  app.use((req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== process.env.CLIENT_URL) return next(new HttpError(403, 'Request blocked.'));
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api', staffRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));
  app.use(errorHandler);
  return app;
}
