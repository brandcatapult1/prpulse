-- Add "Discovery Platform" as a primary creator category.
INSERT INTO categories (name) VALUES ('Discovery Platform')
ON CONFLICT (name) DO NOTHING;
