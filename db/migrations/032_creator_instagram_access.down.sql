DELETE FROM deliverable_metrics WHERE source = 'insights';
ALTER TABLE deliverable_metrics DROP CONSTRAINT IF EXISTS deliverable_metrics_source_check;
ALTER TABLE deliverable_metrics
  ADD CONSTRAINT deliverable_metrics_source_check CHECK (source IN ('api', 'manual'));
DROP TABLE IF EXISTS creator_instagram_requests;
DROP TABLE IF EXISTS creator_instagram_connections;
