/**
 * Lightweight yes/no confirm — renders inline inside a card or drawer section.
 * Never portaled; never a floating overlay.
 */
export function InlineCardConfirm({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  children,
  danger = false,
}) {
  return (
    <div className="space-y-2">
      {title && <p className="text-[11px] font-medium text-ink">{title}</p>}
      {body && <p className="text-[11px] text-ink-secondary">{body}</p>}
      {children}
      <div className="flex gap-1">
        <button type="button" className="btn-secondary flex-1 !py-1 text-[11px]" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`flex-1 !py-1 text-[11px] ${danger ? 'btn-primary bg-health-red hover:opacity-90' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
