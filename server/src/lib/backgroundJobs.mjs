/**
 * Scheduled upkeep. System labels (New / Recent / Frequent) expire with time, so
 * they are re-derived on a timer in addition to the event-driven hooks in SQL.
 */
import { syncAllContactsSocial, syncProviders } from './socialSync.mjs';

const SYSTEM_TAGS_EVERY_MS = 15 * 60 * 1000;
const SOCIAL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

export async function refreshSystemTags(pool) {
  await pool.query('SELECT recompute_contact_system_tags(NULL)');
}

export function startBackgroundJobs(pool) {
  if (!pool) return;

  const tagsTick = () => refreshSystemTags(pool).catch((err) => {
    console.warn('System tag refresh failed:', err.message ?? err);
  });
  tagsTick();
  setInterval(tagsTick, SYSTEM_TAGS_EVERY_MS).unref();

  const providers = syncProviders();
  if (providers.instagram || providers.youtube) {
    const socialTick = () => syncAllContactsSocial(pool)
      .then((r) => console.log('Social sync:', JSON.stringify(r)))
      .catch((err) => console.warn('Social sync failed:', err.message ?? err));
    setTimeout(socialTick, 60_000).unref();
    setInterval(socialTick, SOCIAL_SYNC_EVERY_MS).unref();
  }
}
