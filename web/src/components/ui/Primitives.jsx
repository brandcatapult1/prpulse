import { OverlayPortal } from './OverlayPortal.jsx';

export function Card({ children, className = '', padding = true, elevated = false, interactive = false, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'rounded-xl border bg-white text-left',
        elevated ? 'border-zinc-200 shadow-sm' : 'border-line',
        interactive ? 'transition-all hover:border-brand/30 hover:shadow-md' : '',
        padding ? 'p-4' : '',
        className,
      ].join(' ')}
    >
      {children}
    </Tag>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-white px-6 py-14 text-center">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-2xs text-ink-secondary">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded bg-line ${className}`} />;
}

export function Toast({ message, tone = 'info', onClose }) {
  const colors =
    tone === 'error'
      ? 'border-red-400/80 bg-red-700 text-white shadow-lg shadow-red-950/30'
      : 'border-zinc-700 bg-ink text-white shadow-lg shadow-ink/30';
  return (
    <OverlayPortal>
      <div className={`fixed bottom-4 right-4 z-[80] max-w-sm rounded-lg border px-4 py-3 text-sm ${colors}`}>
        <div className="flex items-start justify-between gap-3">
          <span>{message}</span>
          {onClose && (
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white">
              ×
            </button>
          )}
        </div>
      </div>
    </OverlayPortal>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <OverlayPortal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px]"
        onClick={onCancel}
        role="presentation"
      >
        <div
          className="panel w-full max-w-md p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="confirm-dialog-title" className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-2 text-2xs text-ink-secondary">{body}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-primary" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}

export function Modal({ open, title, children, onClose, footer, mobileSheet = false, compact = false }) {
  if (!open) return null;
  const sizeClass = compact
    ? 'max-w-sm'
    : mobileSheet
      ? 'max-w-lg max-md:fixed max-md:inset-0 max-md:max-h-none max-md:max-w-none max-md:rounded-none'
      : 'max-w-lg';
  return (
    <OverlayPortal>
      <div
        className={`fixed inset-0 z-[70] flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px] ${
          compact ? '' : 'max-md:items-stretch max-md:p-0'
        }`}
        onClick={onClose}
        role="presentation"
      >
        <div
          className={`panel flex w-full flex-col overflow-hidden ${sizeClass} ${
            mobileSheet ? '' : ''
          }`}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`flex items-center justify-between border-b border-line ${compact ? 'px-4 py-3' : 'px-5 py-3.5'}`}>
            <h3 className={`font-semibold text-ink ${compact ? 'text-xs' : 'text-sm'}`}>{title}</h3>
            <button type="button" onClick={onClose} className="text-ink-tertiary hover:text-ink">×</button>
          </div>
          <div className={compact ? 'px-4 py-3' : 'px-5 py-4'}>{children}</div>
          {footer && <div className={`border-t border-line ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>{footer}</div>}
        </div>
      </div>
    </OverlayPortal>
  );
}

export function Drawer({ open, title, children, footer, onClose }) {
  if (!open) return null;
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[65] flex justify-end bg-ink/20" onClick={onClose} role="presentation">
        <div
          className="flex h-full w-full max-w-[480px] flex-col border-l border-line bg-white"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-end border-b border-line px-5 py-3.5">
            {title ? <h3 className="mr-auto text-sm font-semibold text-ink">{title}</h3> : null}
            <button type="button" onClick={onClose} className="text-ink-tertiary hover:text-ink">×</button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-line bg-canvas px-5 py-4">{footer}</div>}
        </div>
      </div>
    </OverlayPortal>
  );
}
