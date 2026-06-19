import { Link } from 'react-router-dom';
import { Drawer } from '../ui/Primitives.jsx';
import { DeliverableRow } from '../deliverables/DeliverableProofSection.jsx';
import { formatDate, formatFee, formatStatus } from '../../lib/format.jsx';
import { getDemoDeliverables, getDemoEngagement } from '../../lib/demo.js';

const REASON_LABELS = {
  business: 'Business',
  vitality: 'Vitality',
  positioning: 'Positioning',
};

export function CampaignQuickEditDrawer({ engagementId, open, onClose }) {
  if (!engagementId) return null;

  const engagement = getDemoEngagement(engagementId);
  const deliverables = getDemoDeliverables(engagementId);
  const reason = engagement.primary_collaboration_reason;

  return (
    <Drawer
      open={open}
      title={engagement.contact_name}
      subtitle={`${engagement.campaign_name} · ${formatStatus(engagement.conversation_status)}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <Link to={`/engagements/${engagementId}`} className="btn-primary" onClick={onClose}>
            Open full record
          </Link>
        </div>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Reason of collaboration</dt>
          <dd className="mt-1 text-sm text-ink">
            {reason ? REASON_LABELS[reason] ?? reason.replace(/_/g, ' ') : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Agreed fee</dt>
          <dd className="mt-1 text-sm text-ink">{formatFee(engagement.agreed_fee)}</dd>
        </div>
        {engagement.visit_date && (
          <div>
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Visit date</dt>
            <dd className="mt-1 text-sm text-ink">{formatDate(engagement.visit_date)}</dd>
          </div>
        )}
        {engagement.next_follow_up_date && (
          <div>
            <dt className="text-2xs font-medium uppercase tracking-wide text-ink-tertiary">Next follow-up</dt>
            <dd className="mt-1 text-sm text-ink">{formatDate(engagement.next_follow_up_date)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Deliverables</h3>
        {deliverables.length === 0 ? (
          <p className="mt-2 text-2xs text-ink-secondary">No deliverables on this engagement yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {deliverables.map((d) => (
              <DeliverableRow
                key={d.id}
                deliverable={d}
                canEditStatus={false}
                canEditProof={false}
                deliverableStatusOptions={[]}
                onStatusChange={() => {}}
                onUpdate={() => {}}
                compact
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">Notes</h3>
        <p className="mt-2 rounded-lg bg-canvas px-3 py-3 text-sm leading-relaxed text-ink-secondary">
          {engagement.notes ?? 'No notes yet.'}
        </p>
      </div>
    </Drawer>
  );
}
