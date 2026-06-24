import { Drawer } from '../ui/Primitives.jsx';
import { deliverableProofSummary } from '../../lib/campaignKanban.js';

/** Read-only proof list for completed collaborations — side drawer. */
export function DeliverableProofDrawer({ engagementId, contactName, open, onClose }) {
  const proofItems = engagementId ? deliverableProofSummary(engagementId) : [];

  return (
    <Drawer
      open={open}
      title={contactName ? `Deliverable proof · ${contactName}` : 'Deliverable proof'}
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      {proofItems.length === 0 ? (
        <p className="text-2xs text-ink-secondary">No proof captured.</p>
      ) : (
        <ul className="space-y-3">
          {proofItems.map((item) => (
            <li key={item.id} className="rounded-lg border border-line bg-canvas px-3 py-2">
              <p className="text-sm font-medium capitalize text-ink">{item.label}</p>
              {item.content_link && (
                <a
                  href={item.content_link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-2xs text-brand hover:underline"
                >
                  {item.content_link}
                </a>
              )}
              {item.screenshots.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-2xs text-ink-secondary">
                  {item.screenshots.map((s) => (
                    <li key={s.id}>{s.label ?? 'Screenshot'}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
