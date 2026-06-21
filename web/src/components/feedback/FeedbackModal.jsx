import { useEffect, useState } from 'react';
import { ConfirmDialog, Modal, Toast } from '../ui/Primitives.jsx';
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

export function FeedbackModal({
  open,
  onClose,
  contactName,
  engagementId,
  contactId,
  initial,
  onSaved,
}) {
  const [form, setForm] = useState(EMPTY);
  const [blacklistPrompt, setBlacklistPrompt] = useState(false);
  const [blacklistOpen, setBlacklistOpen] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...EMPTY, ...initial } : { ...EMPTY });
      setBlacklistPrompt(false);
      setBlacklistOpen(false);
      setBlacklistReason('');
    }
  }, [open, initial]);

  const setRating = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const saveFeedback = async () => {
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
      setBlacklistPrompt(true);
    } else {
      onSaved?.(record);
      onClose();
    }
  };

  const finishWithoutBlacklist = () => {
    setBlacklistPrompt(false);
    onSaved?.(form);
    onClose();
  };

  const confirmBlacklist = async () => {
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
    setBlacklistOpen(false);
    setBlacklistPrompt(false);
    onSaved?.(form);
    onClose();
    setToast(`${contactName} blacklisted`);
  };

  return (
    <>
      <Modal
        open={open && !blacklistPrompt && !blacklistOpen}
        title={`Feedback · ${contactName}`}
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-primary" onClick={saveFeedback}>Save feedback</button>
          </div>
        }
      >
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
              <StarPicker
                value={form[field]}
                onChange={(v) => setRating(field, v)}
              />
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
      </Modal>

      <ConfirmDialog
        open={blacklistPrompt}
        title="Blacklist this creator?"
        body={`You marked adherence or would-work-again as No for ${contactName}. Would you like to blacklist them? Existing engagements stay visible with a banner.`}
        confirmLabel="Yes, blacklist"
        onConfirm={() => {
          setBlacklistPrompt(false);
          setBlacklistOpen(true);
        }}
        onCancel={finishWithoutBlacklist}
      />

      <Modal
        open={blacklistOpen}
        title={`Blacklist · ${contactName}`}
        onClose={() => setBlacklistOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={finishWithoutBlacklist}>Skip</button>
            <button type="button" className="btn-primary" onClick={confirmBlacklist}>Confirm blacklist</button>
          </div>
        }
      >
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
      </Modal>

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
