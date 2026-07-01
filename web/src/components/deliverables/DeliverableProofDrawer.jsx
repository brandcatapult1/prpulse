import { Drawer } from '../ui/Primitives.jsx';
import { deliverableProofSummary } from '../../lib/campaignKanban.js';
import { DeliverableProofList } from './DeliverableProofList.jsx';

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
      <DeliverableProofList proofItems={proofItems} />
    </Drawer>
  );
}
