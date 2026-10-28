/** Signed connect links, token encryption and request messages. Run: npm run test:instagram-connect */
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret';
process.env.APP_URL = 'https://example.test';
process.env.INSTAGRAM_APP_ID = '12345';
process.env.INSTAGRAM_APP_SECRET = 'shh';
const m = await import('../../server/src/lib/instagramConnect.mjs');

const id = '07a8f2af-5504-4227-bba2-990cc268cbba';
assert.equal(m.verifyState(m.signState(id)), id, 'valid state round-trips');
assert.equal(m.verifyState(`${m.signState(id)}x`), null, 'tampered state rejected');
assert.equal(m.verifyState(m.signState(id, Date.now() - 31 * 86_400_000)), null, 'expired state rejected');
assert.equal(m.verifyState('garbage'), null);

const token = 'EAAB-secret-token';
const enc = m.encryptToken(token);
assert.notEqual(enc, token);
assert.equal(m.decryptToken(enc), token, 'token decrypts');

const msg = m.buildRequestMessage({ name: 'Puneet Was Here', link: 'https://example.test/x' });
assert.match(msg, /^Hi Puneet,/);
assert.match(msg, /https:\/\/example\.test\/x/);
assert.equal(m.whatsappUrl('+91 99999-00001', 'hi').startsWith('https://wa.me/919999900001?text='), true);
assert.equal(m.whatsappUrl('', 'hi'), null);
assert.equal(m.mailtoUrl(null, 'hi'), null);
assert.match(m.mailtoUrl('a@b.co', 'hi'), /^mailto:a@b\.co\?subject=/);
console.log('instagram-connect tests passed.');

assert.equal(m.handleFromUrl('https://www.instagram.com/Mrigank8149/'), 'mrigank8149');
assert.equal(m.handleFromUrl('instagram.com/p/abc/'), null);
assert.equal(m.accountMatchesContact('mrigank8149', 'https://www.instagram.com/mrigank8149/'), true);
assert.equal(m.accountMatchesContact('MRIGANK8149', 'https://instagram.com/mrigank8149'), true);
assert.equal(m.accountMatchesContact('cafedefloraindia', 'https://www.instagram.com/mrigank8149/'), false, 'other account rejected');
assert.equal(m.accountMatchesContact('anyone', null), true, 'no link on contact: cannot verify');
console.log('account match tests passed.');

// Instagram Login authorize URL
const url = new URL(m.instagramAuthUrl('abc'));
assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
assert.equal(url.searchParams.get('client_id'), '12345');
assert.equal(url.searchParams.get('redirect_uri'), 'https://example.test/api/instagram/callback');
assert.equal(url.searchParams.get('response_type'), 'code');
assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_insights');
assert.equal(url.searchParams.get('state'), 'abc');
// Approval is paused unless INSTAGRAM_APPROVAL=on
delete process.env.INSTAGRAM_APPROVAL;
assert.equal(m.connectConfigured(), false);
process.env.INSTAGRAM_APPROVAL = 'on';
assert.equal(m.connectConfigured(), true);

// Token response comes back flat or wrapped in a data array
assert.deepEqual(m.parseTokenResponse({ access_token: 'T', user_id: 7 }), { accessToken: 'T', userId: '7' });
assert.deepEqual(m.parseTokenResponse({ data: [{ access_token: 'T2', user_id: '8', permissions: 'x' }] }), { accessToken: 'T2', userId: '8' });
assert.throws(() => m.parseTokenResponse({}), /access token/);
assert.doesNotMatch(msg, /Facebook/, 'message no longer mentions a Facebook Page');
console.log('instagram-login tests passed.');
