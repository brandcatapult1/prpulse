import { contactsApi } from '../../lib/api.js';
import { Pill, formatDate } from '../../lib/format.jsx';

const STATUS = {
  connected: ['success', 'Connected'],
  requested: ['warning', 'Requested'],
  expired: ['danger', 'Needs renewing'],
  error: ['danger', 'Needs renewing'],
  none: ['muted', 'Not requested'],
};

export function accessStatus(data) {
  const c = data?.instagram_connection;
  if (c) return c.status;
  return (data?.instagram_requests?.length ?? 0) > 0 ? 'requested' : 'none';
}

export function InstagramAccessCard({ data, contactId, onChange, onToast }) {
  const req = data.instagram_request;
  const conn = data.instagram_connection;
  const status = accessStatus(data);
  const [tone, label] = STATUS[status] ?? STATUS.none;

  async function record(channel) {
    try {
      onChange(await contactsApi.recordInstagramRequest(contactId, channel));
    } catch (e) {
      onToast?.(e.message ?? 'Could not record request');
    }
  }

  function send(url, channel) {
    window.open(url, '_blank', 'noopener');
    record(channel);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(req.message);
      onToast?.('Message copied — paste it into any chat or email');
    } catch {
      window.prompt('Copy this message:', req.message);
    }
    record('link');
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this creator’s Instagram? Saved numbers are kept.')) return;
    try {
      onChange(await contactsApi.disconnectInstagram(contactId));
    } catch (e) {
      onToast?.(e.message ?? 'Could not disconnect');
    }
  }

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-ink">Instagram access</h3>
            <Pill tone={tone}>{label}</Pill>
          </div>
          <p className="mt-1 text-2xs text-ink-secondary">
            {status === 'connected'
              ? <>Connected{conn?.ig_username ? <> as <b>@{conn.ig_username}</b></> : null}. Reach, saves, shares and reposts are read for the posts in this creator’s deliverables only. Audience numbers are not changed.</>
              : status === 'expired' || status === 'error'
                ? <span className="text-health-red">Access needs renewing{conn?.last_error ? ` (${conn.last_error})` : ''}. Send a new request. Public data is used meanwhile.</span>
                : 'Optional. Until the creator approves, only public likes, comments and views are shown.'}
          </p>
        </div>
        {conn && <button type="button" className="btn-ghost" onClick={disconnect}>Disconnect</button>}
      </div>

      {status !== 'connected' && (
        req?.configured ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={!req.whatsapp_url}
              title={req.whatsapp_url ? '' : 'No mobile number on this contact'}
              onClick={() => send(req.whatsapp_url, 'whatsapp')}>
              Send on WhatsApp
            </button>
            <button type="button" className="btn-secondary" disabled={!req.mailto_url}
              title={req.mailto_url ? '' : 'No email on this contact'}
              onClick={() => send(req.mailto_url, 'email')}>
              Send email
            </button>
            <button type="button" className="btn-secondary" onClick={copy}>Copy message</button>
          </div>
        ) : (
          <p className="mt-2 text-2xs text-ink-tertiary">
            Instagram access requests aren’t set up on the server yet (META_APP_ID / META_APP_SECRET).
          </p>
        )
      )}

      {(data.instagram_requests?.length ?? 0) > 0 && status !== 'connected' && (
        <p className="mt-2 text-2xs text-ink-tertiary">
          Last request: {data.instagram_requests[0].channel}, {formatDate(data.instagram_requests[0].requested_at)}
          {data.instagram_requests[0].requested_by_name ? ` by ${data.instagram_requests[0].requested_by_name}` : ''}
        </p>
      )}
    </div>
  );
}
