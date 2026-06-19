import { OAuth2Client } from 'google-auth-library';

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isDevAuthEnabled() {
  if (isGoogleConfigured()) return false;
  return process.env.DEV_AUTH !== 'false';
}

export function getOAuthClient() {
  if (!isGoogleConfigured()) return null;
  const appUrl = process.env.APP_URL ?? 'http://localhost:8080';
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl.replace(/\/$/, '')}/api/auth/google/callback`,
  );
}

export function sessionUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
  };
}
