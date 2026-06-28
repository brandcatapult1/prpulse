import { useEffect, useState } from 'react';
import { Drawer, Toast } from '../ui/Primitives.jsx';
import { todayIso } from '../../lib/dates.js';
import { saveFeedback as putEngagementFeedback, blacklistContact } from '../../lib/persistence.js';

const EMPTY = {
  content_quality: 0,
  professionalism: 0,
  timeliness: 0,
  adherence_to_terms: true,
  would_work_again: true,
  internal_notes: '',
};

/** Compact feedback for campaign board complete cards. */
export function BoardFeedbackDrawer({
  open,
  onClose,
  contactName,
  contactId,
  initialFeedback,
  onSubmit,
}) {
  const [rating, setRating] = useState(0);
  const [wouldWorkAgain, setWouldWorkAgain] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setRating(initialFeedback?.content_quality ?? 0);
      setWouldWorkAgain(initialFeedback?.would_work_again ?? null);
      setNote(initialFeedback?.internal_notes ?? '');
    }
  }, [open, initialFeedback]);

  function handleSave() {
    if (!rating || wouldWorkAgain == null) return;
    onSubmit?.({ rating, wouldWorkAgain, note });
    onClose();
  }

  return (
    <Drawer
      open={open}
      title={`${initialFeedback ? 'Edit' : 'Log'} feedback · ${contactName}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!rating || wouldWorkAgain == null}
            onClick={handleSave}
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
    </Drawer>
  );
}

/** Full engagement feedback — side drawer (replaces FeedbackModal). */
export function FeedbackDrawer({
  open,
  onClose,
  contactName,
  engagementId,
  contactId,
  initial,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState('form');
  const [blacklistReason, setBlacklistReason] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial } : { ...EMPTY });
      setStep('form');
      setBlacklistReason('');
    }
  }, [open, initial]);

  const setRating = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  async function saveFeedback() {
    if (!form.content_quality || !form.professionalism || !form.timeliness) {
      setToast('Rate all three categories before saving');
      return;
    }

    const record = { ...form, saved_at: todayIso() };
    try {
      await putEngagementFeedback(engagementId, record);
    } catch (err) {
      setToast(err.message ?? 'Could not save feedback');
      return;
    }

    const needsBlacklistPrompt = !form.adherence_to_terms || !form.would_work_again;
    if (needsBlacklistPrompt && contactId) {
      setStep('blacklist_prompt');
    } else {
      onSaved?.(record);
      onClose();
    }
  }

  function finishWithoutBlacklist() {
    onSaved?.(form);
    onClose();
  }

  async function confirmBlacklist() {
    if (!blacklistReason.trim()) {
      setToast('Reason is required to blacklist');
      return;
    }
    try {
      await blacklistContact(contactId, blacklistReason.trim());
    } catch (err) {
      setToast(err.message ?? 'Could not blacklist');
      return;
    }
    onSaved?.(form);
    onClose();
    setToast(`${contactName} blacklisted`);
  }

  const title =
    step === 'blacklist_prompt'
      ? 'Blacklist this creator?'
      : step === 'blacklist_reason'
        ? `Blacklist · ${contactName}`
        : `Feedback · ${contactName}`;

  return (
    <>
      <Drawer
        open={open}
        title={title}
        onClose={onClose}
        footer={
          step === 'form' ? (
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="btn-primary" onClick={saveFeedback}>Save feedback</button>
            </div>
          ) : step === 'blacklist_reason' ? (
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={finishWithoutBlacklist}>Skip</button>
              <button type="button" className="btn-primary" onClick={confirmBlacklist}>Confirm blacklist</button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={finishWithoutBlacklist}>No, keep active</button>
              <button type="button" className="btn-primary" onClick={() => setStep('blacklist_reason')}>
                Yes, blacklist
              </button>
            </div>
          )
        }
      >
        {step === 'form' && (
          <>
            <p className="mb-4 text-2xs text-ink-secondary">
              Record your evaluation after collaboration is complete. This refreshes the contact summary.
            </p>
            <div className="space-y-4">
              {[
                ['content_quality', 'Content quality'],
                ['professionalism', 'Professionalism'],
                ['timeliness', 'Timeliness'],
              ].map(([field, label]) => (
                <div key={field} className="flex items-center justify-between rounded-lg border border-line bg-canvas px-4 py-3">
                  <span className="text-sm text-ink">{label}</span>
                  <StarPicker value={form[field]} onChange={(v) => setRating(field, v)} />
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <YesNoCard
                  label="Adherence to terms"
                  value={form.adherence_to_terms}
                  onChange={(v) => setForm((f) => ({ ...f, adherence_to_terms: v }))}
                />
                <YesNoCard
                  label="Would work again"
                  value={form.would_work_again}
                  onChange={(v) => setForm((f) => ({ ...f, would_work_again: v }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Internal notes</label>
                <textarea
                  className="input-field min-h-[80px] py-2"
                  placeholder="Optional notes for the team…"
                  value={form.internal_notes}
                  onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                />
              </div>
            </div>
          </>
        )}

        {step === 'blacklist_prompt' && (
          <p className="text-2xs text-ink-secondary">
            You marked adherence or would-work-again as No for{' '}
            <span className="font-medium text-ink">{contactName}</span>. Would you like to blacklist them?
            Existing engagements stay visible with a banner.
          </p>
        )}

        {step === 'blacklist_reason' && (
          <>
            <p className="mb-3 text-2xs text-ink-secondary">
              Blacklisted creators are excluded from campaign population by default.
            </p>
            <label className="mb-1.5 block text-2xs font-medium text-ink-secondary">Reason *</label>
            <textarea
              className="input-field min-h-[72px] py-2"
              placeholder="Why should this creator not be added to future campaigns?"
              value={blacklistReason}
              onChange={(e) => setBlacklistReason(e.target.value)}
            />
          </>
        )}
      </Drawer>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className={`text-lg ${star <= value ? 'text-health-amber' : 'text-line'} hover:text-health-amber`}
          aria-label={`${star} stars`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function YesNoCard({ label, value, onChange }) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-3">
      <div className="text-2xs font-medium text-ink-secondary">{label}</div>
      <div className="mt-2 flex gap-2">
        {[
          { opt: true, text: 'Yes' },
          { opt: false, text: 'No' },
        ].map(({ opt, text }) => (
          <button
            key={text}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex-1 rounded-md border py-2 text-2xs font-medium transition-colors ${
              value === opt
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line bg-white text-ink-secondary'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
