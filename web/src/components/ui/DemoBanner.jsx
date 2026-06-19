export function DemoBanner({ show = true }) {
  if (!show) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-2xs text-amber-900">
      <span className="font-medium">Sample data</span>
      {' — '}
      Preview mode while the database is empty. Real records will replace this automatically.
    </div>
  );
}
