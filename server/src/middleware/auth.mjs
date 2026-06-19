export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Sign in required' });
  }
  next();
}

export function attachUser(req, _res, next) {
  req.user = req.session?.user ?? null;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function scopeArchived(includeArchived) {
  return includeArchived ? '' : "AND c.status <> 'archived'";
}

export function scopeBlacklisted(includeBlacklisted) {
  return includeBlacklisted ? '' : 'AND c.is_blacklisted = false';
}

export function stripClientFields(row) {
  if (!row) return row;
  const { agreed_fee, internal_rating, internal_notes, ...safe } = row;
  return safe;
}
