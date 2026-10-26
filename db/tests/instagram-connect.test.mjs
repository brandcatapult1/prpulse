/** Signed connect links, token encryption and request messages. Run: npm run test:instagram-connect */
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-secret';
process.env.APP_URL = 'https://example.test';
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
