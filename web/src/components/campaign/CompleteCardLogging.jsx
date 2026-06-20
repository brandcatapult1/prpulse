import { useMemo, useState } from 'react';
import { Modal } from '../ui/Primitives.jsx';
import { getContactProfileExtras } from '../../lib/contactProfile.js';
import { deliverableProgress, deliverableProofSummary } from '../../lib/campaignKanban.js';
import {
  buildContactFeedbackUpdate,
  contactFeedbackToastMessage,
} from '../../lib/contactFeedbackLogging.js';

export function CompleteCardLogging({
  engagement,
  boardRevision,
  onApplyContactFeedback,
  onError,
}) {
  const [proofOpen, setProofOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [wouldWorkAgain, setWouldWorkAgain] = useState(null);
  const [note, setNote] = useState('');

  const { posted, total } = useMemo(
    () => deliverableProgress(engagement.id),
    [engagement.id, boardRevision],
  );
  const proofItems = useMemo(
    () => deliverableProofSummary(engagement.id),
    [engagement.id, boardRevision],
  );

  function resetFeedback() {
    setRating(0);
    setWouldWorkAgain(null);
    setNote('');
    setFeedbackOpen(false);
  }

  function handleFeedbackSubmit() {
    if (!rating || wouldWorkAgain == null) {
      onError?.('Rating and would-work-again are required');
      return;
    }
    const existing = getContactProfileExtras(engagement.contact_id);
    const { contactProfilePatch, engagementFeedback } = buildContactFeedbackUpdate(existing, {
      rating,
      wouldWorkAgain,
      note,
    });
    onApplyContactFeedback({
      contactId: engagement.contact_id,
      contactProfilePatch,
      engagementFeedback,
      message: contactFeedbackToastMessage(rating, wouldWorkAgain),
    });
    resetFeedback();
  }

  return (
    <>
      <LoggingPanel>
        <div className="max-md:block md:hidden md:group-hover/card:block space-y-2">
          <button
            type="button"
            className="btn-ghost w-full justify-start !py-1 text-[11px] text-brand"
            onClick={() => setProofOpen(true)}
          >
            View proof · {posted}/{total}
          </button>
          <button
            type="button"
            className="btn-secondary w-full !py-1 text-[11px]"
            onClick={() => setFeedbackOpen(true)}
          >
            Log feedback
          </button>
        </div>
      </LoggingPanel>

      <Modal
        open={proofOpen}
        title="Deliverable proof"
        mobileSheet
        onClose={() => setProofOpen(false)}
        footer={
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={() => setProofOpen(false)}>
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
      </Modal>

      <Modal
        open={feedbackOpen}
        title="Log feedback"
        mobileSheet
        onClose={resetFeedback}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={resetFeedback}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!rating || wouldWorkAgain == null}
              onClick={handleFeedbackSubmit}
            >
              Save feedback
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-2xs font-medium text-ink-secondary">Rating</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  className={`text-lg ${star <= rating ? 'text-health-amber' : 'text-line'}`}
                  aria-label={`${star} stars`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-2xs font-medium text-ink-secondary">Would work again?</p>
            <div className="flex gap-2">
              <button
                type="button"
                className={`btn-secondary flex-1 !py-1 text-[11px] ${wouldWorkAgain === true ? 'ring-2 ring-brand' : ''}`}
                onClick={() => setWouldWorkAgain(true)}
              >
                Yes
              </button>
              <button
                type="button"
                className={`btn-secondary flex-1 !py-1 text-[11px] ${wouldWorkAgain === false ? 'ring-2 ring-brand' : ''}`}
                onClick={() => setWouldWorkAgain(false)}
              >
                No
              </button>
            </div>
          </div>

          <label className="block text-2xs text-ink-secondary">
            Note (optional)
            <textarea
              className="input-field mt-1 min-h-[72px] w-full text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Relationship context for the team…"
            />
          </label>
        </div>
      </Modal>
    </>
  );
}

function LoggingPanel({ children }) {
  return (
    <div className="mt-2 border-t border-line/80 pt-2" onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
