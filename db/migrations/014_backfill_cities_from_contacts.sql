-- Register cities already stored on contacts so they appear in filter dropdowns.

INSERT INTO cities (name, country)
SELECT DISTINCT TRIM(c.city), COALESCE(NULLIF(TRIM(c.country), ''), 'IN')
FROM contacts c
WHERE c.city IS NOT NULL AND TRIM(c.city) <> ''
ON CONFLICT (country, name) DO NOTHING;
