import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { migrateUp } from '../../scripts/migrate.mjs';
import { hasDemoFixtures, repairDemoHygiene, seedDemoFixtures } from '../../scripts/seed-demo.mjs';
import { pool } from './db.mjs';
import { ensureCriticalSchema } from './lib/ensureSchema.mjs';
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
import { lookupRouter } from './routes/lookup.mjs';
import { attachUser } from './middleware/auth.mjs';
import { devAuthMiddleware } from './middleware/devAuth.mjs';
import { requireDatabase } from './middleware/database.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const port = Number(process.env.PORT ?? 8080);
const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

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
app.use('/api/lookup', lookupRouter);

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
  console.log(
    databaseConfigured
      ? 'Database: DATABASE_URL is set — running migrations'
      : 'Database: DATABASE_URL is NOT set — add it under Render → pr-pulse → Environment, then redeploy',
  );
  migrateUp()
    .then(() => ensureCriticalSchema(pool))
    .then(async () => {
      if (!databaseConfigured || !pool) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const exists = await hasDemoFixtures(client);
        const result = exists
          ? await repairDemoHygiene(client)
          : await seedDemoFixtures(client, { reset: false });
        await client.query('COMMIT');
        console.log(
          exists ? 'Demo fixture hygiene:' : 'Demo fixtures seeded:',
          result.message ?? JSON.stringify(result),
        );
      } catch (err) {
        await client.query('ROLLBACK');
        console.warn('Demo fixture setup skipped:', err.message ?? err);
      } finally {
        client.release();
      }
    })
    .catch((err) => {
      console.error('Migration failed — running schema repair:', err.message ?? err);
      return ensureCriticalSchema(pool).catch((repairErr) => {
        console.error('Schema repair failed:', repairErr.message ?? repairErr);
      });
    });
});
