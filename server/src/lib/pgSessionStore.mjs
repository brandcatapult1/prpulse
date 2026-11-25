import session from 'express-session';

/**
 * Sessions kept in Postgres so logins survive restarts, idle recycling and
 * multiple server processes (the default in-memory store loses them).
 */
export class PgSessionStore extends session.Store {
  constructor(pool, { ttlMs = 7 * 86400000 } = {}) {
    super();
    this.pool = pool;
    this.ttlMs = ttlMs;
    this.ready = pool.query(
      `CREATE TABLE IF NOT EXISTS http_sessions (
         sid text PRIMARY KEY,
         sess jsonb NOT NULL,
         expires_at timestamptz NOT NULL
       )`,
    ).then(() => pool.query('CREATE INDEX IF NOT EXISTS http_sessions_expires_idx ON http_sessions (expires_at)'))
      .catch((err) => console.warn('Session table setup failed:', err.message));
    const timer = setInterval(() => {
      pool.query('DELETE FROM http_sessions WHERE expires_at < now()').catch(() => {});
    }, 15 * 60_000);
    timer.unref?.();
  }

  expiry(sess) {
    const t = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
    return new Date(Number.isFinite(t) ? t : Date.now() + this.ttlMs);
  }

  get(sid, cb) {
    this.ready
      .then(() => this.pool.query('SELECT sess FROM http_sessions WHERE sid = $1 AND expires_at > now()', [sid]))
      .then(({ rows }) => cb(null, rows[0]?.sess ?? null))
      .catch((err) => cb(err));
  }

  set(sid, sess, cb = () => {}) {
    this.ready
      .then(() => this.pool.query(
        `INSERT INTO http_sessions (sid, sess, expires_at) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expires_at = EXCLUDED.expires_at`,
        [sid, JSON.stringify(sess), this.expiry(sess)],
      ))
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  touch(sid, sess, cb = () => {}) {
    this.ready
      .then(() => this.pool.query('UPDATE http_sessions SET expires_at = $2 WHERE sid = $1', [sid, this.expiry(sess)]))
      .then(() => cb(null))
      .catch((err) => cb(err));
  }

  destroy(sid, cb = () => {}) {
    this.ready
      .then(() => this.pool.query('DELETE FROM http_sessions WHERE sid = $1', [sid]))
      .then(() => cb(null))
      .catch((err) => cb(err));
  }
}
