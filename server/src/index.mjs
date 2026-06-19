import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import { healthRouter } from './routes/health.mjs';
import { contactsRouter } from './routes/contacts.mjs';
import { campaignsRouter } from './routes/campaigns.mjs';
import { engagementsRouter } from './routes/engagements.mjs';
import { dashboardRouter } from './routes/dashboard.mjs';
import { attachUser, requireAuth } from './middleware/auth.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');
const port = Number(process.env.PORT ?? 8080);

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping migrations');
    return;
  }
  execSync('node scripts/migrate.mjs up', { cwd: rootDir, stdio: 'inherit' });
}

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.APP_URL ?? true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 7 * 86400000 },
  }),
);
app.use(attachUser);

app.use('/api/health', healthRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/engagements', engagementsRouter);
app.use('/api/dashboard', dashboardRouter);

app.get('/api/auth/me', requireAuth, (req, res) => res.json(req.user));

app.get('/api/auth/google', (_req, res) => {
  res.json({
    message: 'Google OAuth — configure GOOGLE_CLIENT_ID in cloud env vars',
    configured: Boolean(process.env.GOOGLE_CLIENT_ID),
  });
});

const webDist = path.join(rootDir, 'web/dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(200).json({ service: 'pr-pulse-api', docs: '/api/health' });
  });
});

await runMigrations();
app.listen(port, () => console.log(`PR Pulse listening on :${port}`));
