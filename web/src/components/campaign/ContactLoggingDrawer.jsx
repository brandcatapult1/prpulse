import { Drawer } from '../ui/Primitives.jsx';
import { InConversationCardLogging } from './InConversationCardLogging.jsx';

/**
 * Dashboard (and other non-kanban) entry point for the shared in-conversation contact log flow.
 * Uses the same component and patch path as the campaign board.
 */
export function ContactLoggingDrawer({ engagement, open, onClose, onApply, onError }) {
  if (!engagement) return null;

  return (
    <Drawer
      open={open}
      title={`Log contact · ${engagement.contact_name}`}
      onClose={onClose}
    >
      <p className="mb-4 text-2xs text-ink-secondary">{engagement.campaign_name}</p>
      <InConversationCardLogging
        engagement={engagement}
        alwaysShowActions
        embedded
        onApply={(patch, message, snapshotKeys) =>
          onApply(engagement.id, patch, message, snapshotKeys)}
        onError={onError}
        onComplete={onClose}
      />
    </Drawer>
  );
}
