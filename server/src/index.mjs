import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import { healthRouter } from './routes/health.mjs';
import { authRouter } from './routes/auth.mjs';
import { contactsRouter } from './routes/contacts.mjs';
import { campaignsRouter } from './routes/campaigns.mjs';
import { engagementsRouter } from './routes/engagements.mjs';
import { dashboardRouter } from './routes/dashboard.mjs';
import { attachUser } from './middleware/auth.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const port = Number(process.env.PORT ?? 8080);

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set — skipping migrations');
    return;
  }
  try {
    execSync('node scripts/migrate.mjs up', { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Migration failed — app will still start:', err.message ?? err);
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET ?? 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 86400000,
    },
  }),
);
app.use(attachUser);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/engagements', engagementsRouter);
app.use('/api/dashboard', dashboardRouter);

const webDist = path.join(rootDir, 'web/dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(200).json({ service: 'pr-pulse-api', docs: '/api/health' });
  });
});

await runMigrations();
app.listen(port, () => console.log(`PR Pulse listening on :${port}`));
