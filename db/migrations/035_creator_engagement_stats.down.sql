ALTER TABLE creator_social_stats
  DROP COLUMN IF EXISTS avg_views,
  DROP COLUMN IF EXISTS engagement_rate;
