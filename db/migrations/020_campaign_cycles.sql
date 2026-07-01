-- Per-campaign delivery cycles (monthly retainer windows or single project term).

CREATE TABLE campaign_cycles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  cycle_number  integer NOT NULL CHECK (cycle_number >= 1),
  cycle_start   date NOT NULL,
  cycle_end     date NOT NULL,
  target        integer NOT NULL CHECK (target >= 0),
  UNIQUE (campaign_id, cycle_number),
  CHECK (cycle_end > cycle_start)
);

CREATE INDEX idx_campaign_cycles_campaign_id ON campaign_cycles(campaign_id);
