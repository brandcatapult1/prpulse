import { formatPostedDateIst } from '../../lib/format.jsx';

function isStoryProof(item) {
  return (item?.deliverable_type ?? '').toLowerCase() === 'story';
}

function postedLabel(date) {
  const formatted = formatPostedDateIst(date);
  return formatted ? `Posted ${formatted}` : null;
}

/** Read-only deliverable proof list — shared by proof drawer and Reports. */
export function DeliverableProofList({ proofItems }) {
  const items = Array.isArray(proofItems) ? proofItems : [];

  if (items.length === 0) {
    return <p className="text-2xs text-ink-secondary">No proof captured.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const story = isStoryProof(item);
        const itemPostedLabel = postedLabel(item.posted_date);

        return (
          <li key={item.id} className="rounded-lg border border-line bg-canvas px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium capitalize text-ink">{item.label}</p>
              {!story && itemPostedLabel && (
                <p className="text-2xs text-ink-tertiary">{itemPostedLabel}</p>
              )}
            </div>

            {(item.links ?? []).map((link) => (
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

            {(item.screenshots?.length ?? 0) > 0 && (
              <div
                className={
                  story
                    ? 'mt-2 flex max-w-full flex-wrap gap-3'
                    : 'mt-2 grid max-w-full grid-cols-2 gap-2'
                }
              >
                {item.screenshots.map((s) => {
                  const shotPostedLabel = postedLabel(s.posted_date ?? item.posted_date);

                  if (!s.url) {
                    return (
                      <div
                        key={s.id}
                        className="flex items-center rounded-md border border-line px-2 py-1 text-2xs text-ink-secondary"
                      >
                        📎 {s.label ?? 'Screenshot'}
                      </div>
                    );
                  }

                  if (story) {
                    return (
                      <figure
                        key={s.id}
                        className="w-[calc(50%-0.375rem)] max-w-[140px] shrink-0 overflow-hidden rounded-md border border-line bg-white sm:w-[120px]"
                      >
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block aspect-[9/16] w-full overflow-hidden"
                        >
                          <img
                            src={s.url}
                            alt={s.label ?? 'Story proof'}
                            className="h-full w-full object-cover"
                          />
                        </a>
                        {(shotPostedLabel || s.label) && (
                          <figcaption className="space-y-0.5 px-1.5 py-1">
                            {shotPostedLabel && (
                              <p className="text-[10px] text-ink-tertiary">{shotPostedLabel}</p>
                            )}
                            {s.label && s.label !== 'Screenshot' && (
                              <p className="truncate text-[10px] text-ink-tertiary">{s.label}</p>
                            )}
                          </figcaption>
                        )}
                      </figure>
                    );
                  }

                  return (
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
                  );
                })}
              </div>
            )}

            {(item.links?.length ?? 0) === 0 && (item.screenshots?.length ?? 0) === 0 && (
              <p className="mt-1 text-2xs text-ink-tertiary">No proof captured.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
