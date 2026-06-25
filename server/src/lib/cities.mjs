/** Supported location / phone countries — single source for server validation. */
export const SUPPORTED_COUNTRY_CODES = ['IN', 'AE', 'US', 'GB'];

export const DEFAULT_CITIES = [
  // India
  { name: 'Mumbai', country: 'IN' },
  { name: 'Delhi', country: 'IN' },
  { name: 'Bengaluru', country: 'IN' },
  { name: 'Hyderabad', country: 'IN' },
  { name: 'Chennai', country: 'IN' },
  { name: 'Kolkata', country: 'IN' },
  { name: 'Pune', country: 'IN' },
  { name: 'Ahmedabad', country: 'IN' },
  { name: 'Jaipur', country: 'IN' },
  { name: 'Goa', country: 'IN' },
  // UAE
  { name: 'Dubai', country: 'AE' },
  { name: 'Abu Dhabi', country: 'AE' },
  { name: 'Sharjah', country: 'AE' },
  // USA
  { name: 'New York', country: 'US' },
  { name: 'Los Angeles', country: 'US' },
  { name: 'San Francisco', country: 'US' },
  { name: 'Chicago', country: 'US' },
  { name: 'Miami', country: 'US' },
  // UK
  { name: 'London', country: 'GB' },
  { name: 'Manchester', country: 'GB' },
  { name: 'Birmingham', country: 'GB' },
  { name: 'Edinburgh', country: 'GB' },
];

export async function ensureCities(client) {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM cities');
  if (rows[0].n > 0) return;

  for (const { name, country } of DEFAULT_CITIES) {
    await client.query(
      `INSERT INTO cities (name, country) VALUES ($1, $2) ON CONFLICT (country, name) DO NOTHING`,
      [name, country],
    );
  }
}

export async function loadCities(client, { country } = {}) {
  await ensureCities(client);
  if (country && SUPPORTED_COUNTRY_CODES.includes(country)) {
    const { rows } = await client.query(
      `SELECT id, name, country, created_at FROM cities WHERE country = $1 ORDER BY name`,
      [country],
    );
    return rows;
  }
  const { rows } = await client.query(
    `SELECT id, name, country, created_at FROM cities ORDER BY country, name`,
  );
  return rows;
}

export function assertSupportedCountry(code) {
  if (!code || !SUPPORTED_COUNTRY_CODES.includes(code)) {
    throw Object.assign(new Error('Invalid country'), { status: 400 });
  }
  return code;
}

/** Validate city is on the admin-managed list for the given country. */
export async function assertValidCity(client, cityName, countryCode) {
  const name = String(cityName ?? '').trim();
  if (!name) return null;

  const country = assertSupportedCountry(countryCode);
  await ensureCities(client);

  const { rows } = await client.query(
    `SELECT id, name, country FROM cities WHERE name = $1 AND country = $2`,
    [name, country],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Select a city from the list'), { status: 400 });
  }
  return rows[0];
}
