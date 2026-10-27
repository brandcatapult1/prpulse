-- Average views and engagement rate over a creator's latest 5 public posts/reels.
ALTER TABLE creator_social_stats
  ADD COLUMN IF NOT EXISTS avg_views       numeric,
  ADD COLUMN IF NOT EXISTS engagement_rate numeric;
