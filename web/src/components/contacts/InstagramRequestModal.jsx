import { useEffect, useState } from 'react';
import { contactsApi } from '../../lib/api.js';

const STATUS_TEXT = {
  connected: 'Connected',
  expired: 'Needs renewing',
  error: 'Needs renewing',
};

/** Pick creators in the list, then send each one a WhatsApp / email request (nothing goes out automatically). */
export function InstagramRequestModal({ contactIds, onClose }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState({});

  useEffect(() => {
    contactsApi.instagramLinks(contactIds).then(setItems).catch((e) => setError(e.message));
  }, [contactIds]);

  function send(item, channel, url) {
    window.open(url, '_blank', 'noopener');
    contactsApi.recordInstagramRequest(item.id, channel).catch(() => {});
    setSent((s) => ({ ...s, [item.id]: channel }));
  }

  async function copy(item) {
    try {
      await navigator.clipboard.writeText(item.message);
    } catch {
      window.prompt('Copy this message:', item.message);
    }
    contactsApi.recordInstagramRequest(item.id, 'link').catch(() => {});
    setSent((s) => ({ ...s, [item.id]: 'link' }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">Request Instagram access</h3>
            <p className="mt-0.5 text-2xs text-ink-secondary">
              Each creator gets their own link. Click a button to open WhatsApp or your email with the message ready —
              you press send. Creators who don’t approve stay on public data.
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
        </div>

        {error && <p className="mt-3 text-2xs text-health-red">{error}</p>}
        {!items && !error && <p className="mt-4 text-2xs text-ink-tertiary">Preparing links…</p>}

        <ul className="mt-3 divide-y divide-line">
          {(items ?? []).map((it) => (
            <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{it.full_name}</p>
                <p className="text-2xs text-ink-tertiary">
                  {it.connection_status === 'connected'
                    ? 'Already connected'
                    : sent[it.id]
                      ? `Request marked as sent (${sent[it.id]})`
                      : STATUS_TEXT[it.connection_status] ?? 'Not requested'}
                </p>
              </div>
              {it.connection_status !== 'connected' && (
                <div className="flex gap-1.5">
                  <button type="button" className="btn-primary" disabled={!it.whatsapp_url}
                    title={it.whatsapp_url ? '' : 'No mobile number'}
                    onClick={() => send(it, 'whatsapp', it.whatsapp_url)}>WhatsApp</button>
                  <button type="button" className="btn-secondary" disabled={!it.mailto_url}
                    title={it.mailto_url ? '' : 'No email'}
                    onClick={() => send(it, 'email', it.mailto_url)}>Email</button>
                  <button type="button" className="btn-secondary" onClick={() => copy(it)}>Copy</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
