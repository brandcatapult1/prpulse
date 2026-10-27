import { Router } from 'express';
import { pool } from '../db.mjs';
import {
  connectConfigured,
  exchangeCodeForLongLivedToken,
  fetchInstagramIdentity,
  instagramAuthUrl,
  saveConnection,
  verifyState,
} from '../lib/instagramConnect.mjs';
import { syncContactSocial } from '../lib/socialSync.mjs';

/** Public (no sign-in): the creator opens the link we send them and approves access once. */
export const instagramRouter = Router();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function page(res, title, message, status = 200) {
  res.status(status).type('html').send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(title)}</title></head><body style="font-family:system-ui;max-width:420px;margin:15vh auto;padding:0 20px;text-align:center">`
    + `<h2>${esc(title)}</h2><p style="color:#475467">${esc(message)}</p></body></html>`,
  );
}

instagramRouter.get('/connect', (req, res) => {
  if (!connectConfigured()) {
    return page(res, 'Not available', 'Instagram connection is not set up yet. Please contact Brand Catapult.', 503);
  }
  if (!verifyState(req.query.state)) {
    return page(res, 'Link expired', 'This link is invalid or has expired. Ask Brand Catapult for a new one.', 400);
  }
  res.redirect(instagramAuthUrl(String(req.query.state)));
});

instagramRouter.get('/callback', async (req, res) => {
  const contactId = verifyState(req.query.state);
  if (!contactId) {
    return page(res, 'Link expired', 'This link is invalid or has expired. Ask Brand Catapult for a new one.', 400);
  }
  if (req.query.error || !req.query.code) {
    return page(res, 'Not connected', 'Access was not granted, so nothing was connected. You can reopen the link to try again.');
  }
  try {
    const { token, expiresAt } = await exchangeCodeForLongLivedToken(String(req.query.code));
    const { igUserId, username } = await fetchInstagramIdentity(token);
    await saveConnection(pool, contactId, { igUserId, username, token, expiresAt });
    // Pull numbers right away; a failure is recorded on the connection, not shown to the creator.
    syncContactSocial(pool, contactId).catch((err) => console.warn('Initial IG sync failed:', err.message));
    page(res, 'Instagram connected', `Thank you${username ? `, @${username}` : ''}. You can close this page.`);
  } catch (err) {
    page(res, 'Could not connect', err.message ?? 'Something went wrong. Please try again.', 400);
  }
});
