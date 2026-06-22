import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { migrateUp } from '../../scripts/migrate.mjs';
import { healthRouter } from './routes/health.mjs';
import { authRouter } from './routes/auth.mjs';
import { contactsRouter } from './routes/contacts.mjs';
import { campaignsRouter } from './routes/campaigns.mjs';
import { engagementsRouter } from './routes/engagements.mjs';
import { dashboardRouter } from './routes/dashboard.mjs';
import { registrationsRouter } from './routes/registrations.mjs';
import { brandsRouter } from './routes/brands.mjs';
import { importRouter } from './routes/import.mjs';
import { adminRouter } from './routes/admin.mjs';
import { orgRouter } from './routes/org.mjs';
import { reportsRouter } from './routes/reports.mjs';
import { attachUser } from './middleware/auth.mjs';
import { devAuthMiddleware } from './middleware/devAuth.mjs';
import { requireDatabase } from './middleware/database.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const port = Number(process.env.PORT ?? 8080);

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
app.use('/api', devAuthMiddleware);
app.use('/api', requireDatabase);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/engagements', engagementsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/registrations', registrationsRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/import', importRouter);
app.use('/api/admin', adminRouter);
app.use('/api/org', orgRouter);
app.use('/api/reports', reportsRouter);

const webDist = path.join(rootDir, 'web/dist');
app.use(express.static(webDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'), (err) => {
    if (err) res.status(200).json({ service: 'pr-pulse-api', docs: '/api/health' });
  });
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message ?? err);
  if (res.headersSent) return;
  res.status(err.status ?? 503).json({ error: err.message ?? 'Server error' });
});

app.listen(port, () => {
  console.log(`PR Pulse listening on :${port}`);
  migrateUp().catch((err) => {
    console.error('Migration failed — app will still run:', err.message ?? err);
  });
});
