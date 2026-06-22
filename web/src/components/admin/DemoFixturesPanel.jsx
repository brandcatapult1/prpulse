import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Toast } from '../ui/Primitives.jsx';
import { adminApi } from '../../lib/api.js';
import { DEMO_BRAND_NAME } from '../../lib/demoFixtures.js';

export function DemoFixturesPanel() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  async function runSeed(reset) {
    setLoading(true);
    setToast(null);
    try {
      const result = await adminApi.seedDemo(reset);
      if (result.skipped) {
        setToast(result.message);
      } else {
        setToast(
          `Loaded ${result.contacts} creators across ${result.campaigns ?? 3} campaigns — open Dashboard or Campaigns.`,
        );
      }
    } catch (err) {
      setToast(err.message ?? 'Could not load demo fixtures');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card elevated className="mt-4 !p-5">
        <h2 className="text-sm font-semibold text-ink">Demo fixtures</h2>
        <p className="mt-1 text-2xs text-ink-secondary">
          Sample data loads automatically on first deploy when the database is empty. Use these
          buttons to reload manually — brand{' '}
          <span className="text-ink">{DEMO_BRAND_NAME}</span>, three campaigns, ten creators across
          kanban stages, three fixture managers (Aisha, Rohan, Neha).
        </p>
        <p className="mt-2 text-2xs text-ink-tertiary">
          Safe to re-run: skips if already loaded. Reset replaces demo rows only (not your other data).
          Flush everything before go-live separately.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => runSeed(false)}
          >
            {loading ? 'Loading…' : 'Load demo fixtures'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading}
            onClick={() => runSeed(true)}
          >
            Reset demo fixtures
          </button>
          <Link to="/campaigns" className="btn-ghost">
            View campaigns →
          </Link>
        </div>
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
