-- Campaign managers get a due-today reminder toast at most every 3 hours.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminders_shown_at timestamptz;
