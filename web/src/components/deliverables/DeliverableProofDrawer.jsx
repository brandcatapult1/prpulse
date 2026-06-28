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

              {item.links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-2xs text-brand hover:underline"
                >
                  {link}
                </a>
              ))}

              {item.screenshots.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {item.screenshots.map((s) =>
                    (s.url ? (
                      <figure key={s.id} className="overflow-hidden rounded-md border border-line bg-white">
                        <a href={s.url} target="_blank" rel="noreferrer">
                          <img
                            src={s.url}
                            alt={s.label ?? 'Screenshot'}
                            className="h-32 w-full object-cover"
                          />
                        </a>
                        {s.label && (
                          <figcaption className="truncate px-1.5 py-1 text-[10px] text-ink-tertiary">
                            {s.label}
                          </figcaption>
                        )}
                      </figure>
                    ) : (
                      <div
                        key={s.id}
                        className="flex items-center rounded-md border border-line px-2 py-1 text-2xs text-ink-secondary"
                      >
                        📎 {s.label ?? 'Screenshot'}
                      </div>
                    )),
                  )}
                </div>
              )}

              {item.links.length === 0 && item.screenshots.length === 0 && (
                <p className="mt-1 text-2xs text-ink-tertiary">No proof captured.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
